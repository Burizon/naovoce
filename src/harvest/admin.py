from django.contrib import admin
from django.utils.translation import ugettext_lazy as _
from leaflet.admin import LeafletGeoAdmin

from .models import HarvestAlert, HarvestAlertDelivery, RipenessReport


@admin.register(RipenessReport)
class RipenessReportAdmin(admin.ModelAdmin):
    list_display = "fruit state observed_on author created".split()
    list_filter = "state fruit__kind__name_cs".split()
    search_fields = "fruit__id author__username note".split()
    date_hierarchy = "observed_on"
    raw_id_fields = "fruit author".split()


class HarvestAlertDeliveryInline(admin.TabularInline):
    model = HarvestAlertDelivery
    extra = 0
    readonly_fields = "kind part season_year season_start sent".split()

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(HarvestAlert)
class HarvestAlertAdmin(LeafletGeoAdmin):
    list_display = "name user _kinds lead_days is_active via_email created".split()
    list_filter = "is_active via_email".split()
    search_fields = "name user__username user__email".split()
    filter_horizontal = ("kinds",)
    raw_id_fields = ("user",)
    inlines = (HarvestAlertDeliveryInline,)

    def _kinds(self, obj):
        return ", ".join(str(kind) for kind in obj.kinds.all()) or _("all")

    _kinds.short_description = _("kinds")
