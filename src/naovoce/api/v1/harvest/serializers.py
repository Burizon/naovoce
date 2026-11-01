from django.contrib.gis.geos import Polygon
from django.utils.translation import ugettext_lazy as _
from rest_framework import serializers

from fruit.models import Kind
from harvest import services
from harvest.models import RipenessReport, SeasonWatch

# Reports may be added a little later, but not for a past season.
MAX_REPORT_AGE_DAYS = 60


def bbox_polygon(west, south, east, north):
    """Polygon of a [west, south, east, north] bounding box in WGS 84 degrees.

    A zoomed-out map reports longitudes beyond ±180° (the world repeats); they are clamped.
    """
    west, east = max(west, -180.0), min(east, 180.0)
    south, north = max(south, -90.0), min(north, 90.0)
    if not (west < east and south < north):
        raise serializers.ValidationError(_("Bounding box must be [west, south, east, north]."))
    return Polygon.from_bbox((west, south, east, north))


def choice_values_by_name(choices):
    """{name: value} of a `utils.choices.Choices` instance."""
    return {choices.name_of(value): value for value, _text in choices.choices}


class ChoiceNameField(serializers.ChoiceField):
    """Exposes Choices by their symbolic names instead of numbers."""

    def __init__(self, values_by_name, **kwargs):
        # Takes a plain dict: DRF deep-copies the arguments of declared fields.
        self.values_by_name = values_by_name
        self.names_by_value = {value: name for name, value in values_by_name.items()}
        super().__init__(choices=list(values_by_name), **kwargs)

    def to_representation(self, value):
        return self.names_by_value[value]

    def to_internal_value(self, data):
        return self.values_by_name[super().to_internal_value(data)]


class RipenessReportSerializer(serializers.ModelSerializer):

    state = ChoiceNameField(choice_values_by_name(RipenessReport.STATE))

    author = serializers.CharField(source="author.username", read_only=True)

    observed_on = serializers.DateField(required=False)

    def validate_observed_on(self, value):
        today = services.today()
        if value > today:
            raise serializers.ValidationError(_("Ripeness cannot be reported for a future day."))
        if (today - value).days > MAX_REPORT_AGE_DAYS:
            raise serializers.ValidationError(
                _("Ripeness can be reported at most {days} days back.").format(days=MAX_REPORT_AGE_DAYS)
            )
        return value

    class Meta:
        model = RipenessReport
        fields = "id state observed_on note author created".split()
        read_only_fields = ("created",)


class WindowSerializer(serializers.Serializer):
    def to_representation(self, instance):
        return instance.as_dict()


class SeasonSpecSerializer(serializers.Serializer):
    def to_representation(self, instance):
        return {
            "part": instance.part,
            "start": instance.start,
            "duration": instance.duration,
            "months": instance.months,
        }


class KindKeyField(serializers.SlugRelatedField):
    def __init__(self, **kwargs):
        super().__init__(slug_field="key", queryset=Kind.objects.valid(), **kwargs)


class CalendarSerializer(serializers.Serializer):
    kind = serializers.CharField(source="kind.key")
    name = serializers.CharField(source="kind.name")
    col = serializers.CharField(source="kind.color")
    cls = serializers.CharField(source="kind.cls_name")
    count = serializers.IntegerField()
    typical = SeasonSpecSerializer(many=True)
    ripe_reports_by_month = serializers.ListField(child=serializers.IntegerField())


class NewsItemSerializer(serializers.Serializer):
    kind = serializers.CharField(source="kind.key")
    name = serializers.CharField(source="kind.name")
    col = serializers.CharField(source="kind.color")
    count = serializers.IntegerField()
    ripe_reports = serializers.IntegerField()
    window = WindowSerializer(allow_null=True)


class SeasonNewsSerializer(serializers.Serializer):
    started = NewsItemSerializer(many=True)
    soon = NewsItemSerializer(many=True)
    running = NewsItemSerializer(many=True)
    ending = NewsItemSerializer(many=True)
    ripe_now = NewsItemSerializer(many=True)


class SeasonWatchSerializer(serializers.ModelSerializer):

    kinds = KindKeyField(many=True, required=False)

    class Meta:
        model = SeasonWatch
        fields = "kinds lead_days frequency_days via_app via_email last_sent".split()
        read_only_fields = ("last_sent",)
