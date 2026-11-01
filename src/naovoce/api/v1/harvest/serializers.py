from django.contrib.gis.geos import Polygon
from django.utils.translation import ugettext_lazy as _
from rest_framework import serializers

from fruit.models import Kind
from harvest import services
from harvest.models import HarvestAlert, RipenessReport

# A watched area may span the whole Czech Republic (about 6.8° × 2.5°), not a continent.
MAX_ALERT_AREA_DEGREES = 8.0
# Reports may be added a little later, but not for a past season.
MAX_REPORT_AGE_DAYS = 60


def bbox_polygon(west, south, east, north, max_degrees=None):
    """Validated polygon of a [west, south, east, north] bounding box in WGS 84 degrees."""
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise serializers.ValidationError(_("Bounding box must be [west, south, east, north]."))
    if max_degrees is not None and (east - west > max_degrees or north - south > max_degrees):
        raise serializers.ValidationError(_("The watched area is too large, zoom in on the map."))
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


class AreaOverviewSerializer(serializers.Serializer):
    kind = serializers.CharField(source="kind.key")
    name = serializers.CharField(source="kind.name")
    col = serializers.CharField(source="kind.color")
    count = serializers.IntegerField()
    windows = WindowSerializer(many=True)


class CalendarSerializer(serializers.Serializer):
    kind = serializers.CharField(source="kind.key")
    name = serializers.CharField(source="kind.name")
    col = serializers.CharField(source="kind.color")
    cls = serializers.CharField(source="kind.cls_name")
    count = serializers.IntegerField()
    typical = SeasonSpecSerializer(many=True)
    ripe_reports_by_month = serializers.ListField(child=serializers.IntegerField())


class BboxField(serializers.ListField):
    """Area as [west, south, east, north] in WGS 84 degrees."""

    child = serializers.FloatField()

    def to_representation(self, value):
        return list(value.extent)

    def to_internal_value(self, data):
        coordinates = super().to_internal_value(data)
        if len(coordinates) != 4:
            raise serializers.ValidationError(_("Bounding box must be [west, south, east, north]."))
        return bbox_polygon(*coordinates, max_degrees=MAX_ALERT_AREA_DEGREES)


class HarvestAlertSerializer(serializers.ModelSerializer):

    bbox = BboxField(source="area")

    kinds = KindKeyField(many=True, required=False)

    overview = serializers.SerializerMethodField()

    def get_overview(self, obj):
        rows = services.area_overview(obj.area, list(obj.kinds.all()) or None)
        return AreaOverviewSerializer(rows, many=True).data

    class Meta:
        model = HarvestAlert
        fields = "id name bbox kinds lead_days is_active via_email created overview".split()
        read_only_fields = ("created",)
