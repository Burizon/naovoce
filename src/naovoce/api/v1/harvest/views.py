import datetime

from django.utils.translation import ugettext_lazy as _
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from fruit.models import Fruit
from harvest import services
from harvest.models import RipenessReport, SeasonWatch

from ..permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from . import serializers

# How far back the season endpoint lists individual reports.
REPORT_LIST_DAYS = 400
REPORT_LIST_LIMIT = 50


def parse_bbox(value):
    """Parse `west,south,east,north` query parameter into a polygon."""
    try:
        west, south, east, north = (float(part) for part in value.split(","))
        return serializers.bbox_polygon(west, south, east, north)
    except ValueError:
        raise ValidationError({"bbox": _("Bounding box must be four numbers: west,south,east,north.")})
    except ValidationError as e:
        raise ValidationError({"bbox": e.detail})


class FruitSeason(APIView):
    """Harvest season of one plant: prediction, typical season of its kind and ripeness reports.

    POST adds (or changes) today's — or `observed_on` — ripeness report of the current user.
    """

    permission_classes = (IsAuthenticatedOrReadOnly,)

    def get_fruit(self):
        return get_object_or_404(Fruit.objects.valid().select_related("kind"), pk=self.kwargs["pk"])

    def season_data(self, fruit):
        day = services.today()
        reports = (
            fruit.ripeness_reports.select_related("author")
            .filter(observed_on__gte=day - datetime.timedelta(days=REPORT_LIST_DAYS))
            .order_by("-observed_on", "-created")[:REPORT_LIST_LIMIT]
        )
        return {
            "fruit": fruit.id,
            "kind": fruit.kind.key,
            **services.fruit_season(fruit, day),
            "reports": serializers.RipenessReportSerializer(reports, many=True).data,
        }

    def get(self, request, *args, **kwargs):
        return Response(self.season_data(self.get_fruit()))

    def post(self, request, *args, **kwargs):
        fruit = self.get_fruit()
        serializer = serializers.RipenessReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        observed_on = serializer.validated_data.pop("observed_on", services.today())
        _report, created = RipenessReport.objects.update_or_create(
            fruit=fruit,
            author=request.user,
            observed_on=observed_on,
            defaults=serializer.validated_data,
        )

        return Response(
            self.season_data(fruit),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class HarvestCalendar(generics.GenericAPIView):
    """Typical harvest months and reported ripening per kind, optionally for `?bbox=w,s,e,n`."""

    serializer_class = serializers.CalendarSerializer

    def get(self, request, *args, **kwargs):
        area = parse_bbox(bbox) if (bbox := request.query_params.get("bbox")) else None
        rows = services.calendar(area)
        if area is not None:
            rows = [row for row in rows if row["count"]]
        return Response(self.get_serializer(rows, many=True).data)


class SeasonNews(APIView):
    """What starts, runs and ends now over the whole map; `?lead_days=` (default 30) looks ahead."""

    def get(self, request, *args, **kwargs):
        lead = request.query_params.get("lead_days", "30")
        if not lead.isdigit() or not 0 <= int(lead) <= 90:
            raise ValidationError({"lead_days": _("Days ahead must be a number 0–90.")})
        news = services.season_news(services.today(), int(lead))
        return Response({"date": services.today().isoformat(), **serializers.SeasonNewsSerializer(news).data})


class MySeasonWatch(generics.RetrieveUpdateAPIView):
    """Season news settings of the current user; created with the defaults on first access."""

    serializer_class = serializers.SeasonWatchSerializer
    permission_classes = (IsAuthenticated,)

    def get_object(self):
        watch, _created = SeasonWatch.objects.get_or_create(user=self.request.user)
        return watch
