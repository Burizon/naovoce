from django.contrib import admin
from django.utils.translation import ugettext_lazy as _

from .models import RipenessReport, SeasonWatch


@admin.register(RipenessReport)
class RipenessReportAdmin(admin.ModelAdmin):
    list_display = "fruit state observed_on author created".split()
    list_filter = "state fruit__kind__name_cs".split()
    search_fields = "fruit__id author__username note".split()
    date_hierarchy = "observed_on"
    raw_id_fields = "fruit author".split()


@admin.register(SeasonWatch)
class SeasonWatchAdmin(admin.ModelAdmin):
    list_display = "user _kinds lead_days frequency_days via_app via_email last_sent".split()
    list_filter = "via_app via_email frequency_days lead_days".split()
    search_fields = "user__username user__email".split()
    filter_horizontal = ("kinds",)
    raw_id_fields = ("user",)

    def _kinds(self, obj):
        return ", ".join(str(kind) for kind in obj.kinds.all()) or _("all")

    _kinds.short_description = _("kinds")
