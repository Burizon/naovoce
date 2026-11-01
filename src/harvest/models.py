import logging

from django.conf import settings
from django.contrib.gis.db.models import PolygonField
from django.core.validators import MaxValueValidator
from django.db import models
from django.db.models.signals import post_save
from django.utils import timezone
from django.utils.translation import ugettext_lazy as _

from utils.choices import Choices
from utils.models import TimeStampedModel

logger = logging.getLogger(__name__)


class RipenessReport(TimeStampedModel):
    """Observation of how ripe a concrete mapped plant was on a given day.

    Reports are the crowd-sourced counterpart of the typical seasons kept in herbarium:
    ripe reports of past years predict when this very plant ripens again.
    """

    STATE = Choices(
        unripe=(1000, _("not ripe yet")),
        ripe=(2000, _("ripe")),
        over=(3000, _("season over")),
    )

    fruit = models.ForeignKey(
        "fruit.Fruit",
        verbose_name=_("fruit"),
        related_name="ripeness_reports",
        on_delete=models.CASCADE,
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("author"),
        related_name="ripeness_reports",
        on_delete=models.CASCADE,
    )
    state = models.IntegerField(_("ripeness"), choices=STATE.choices)
    observed_on = models.DateField(_("observed on"), default=timezone.localdate, db_index=True)
    note = models.CharField(_("note"), max_length=280, blank=True)

    def __str__(self):
        return f"{self.fruit!s} — {self.STATE.text_of(self.state)} ({self.observed_on:%Y-%m-%d})"

    @classmethod
    def post_create(cls, sender, instance, created, *args, **kwargs):
        if created:
            logger.info(
                "Ripeness report {state} on fruit {fruit_id} created by user {user!s}.".format(
                    state=cls.STATE.name_of(instance.state),
                    fruit_id=instance.fruit_id,
                    user=instance.author,
                )
            )

    class Meta:
        verbose_name = _("ripeness report")
        verbose_name_plural = _("ripeness reports")
        ordering = ("-observed_on", "-created")
        unique_together = ("fruit", "author", "observed_on")


post_save.connect(RipenessReport.post_create, sender=RipenessReport)


class HarvestAlert(TimeStampedModel):
    """User's watch over a map area: notify when the harvest season of watched kinds begins there."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("user"),
        related_name="harvest_alerts",
        on_delete=models.CASCADE,
    )
    name = models.CharField(_("name"), max_length=100)
    area = PolygonField(_("area"), srid=4326)
    kinds = models.ManyToManyField(
        "fruit.Kind",
        verbose_name=_("kinds"),
        related_name="harvest_alerts",
        blank=True,
        help_text=_("Leave empty to watch all kinds mapped in the area."),
    )
    lead_days = models.PositiveSmallIntegerField(
        _("days in advance"),
        default=3,
        validators=[MaxValueValidator(60)],
        help_text=_("How many days before the expected season start to notify."),
    )
    is_active = models.BooleanField(_("active"), default=True)
    via_email = models.BooleanField(_("notify by e-mail"), default=True)

    def is_owner(self, user):
        return self.user == user

    def __str__(self):
        return f"{self.name} ({self.user!s})"

    class Meta:
        verbose_name = _("harvest alert")
        verbose_name_plural = _("harvest alerts")
        ordering = ("-created",)


class HarvestAlertDelivery(models.Model):
    """Record of an announced season so that one season occurrence is announced only once."""

    alert = models.ForeignKey(HarvestAlert, related_name="deliveries", on_delete=models.CASCADE)
    kind = models.ForeignKey("fruit.Kind", related_name="+", on_delete=models.CASCADE)
    part = models.CharField(_("ripening plant part"), max_length=255, blank=True)
    season_year = models.PositiveSmallIntegerField(_("season year"))
    season_start = models.DateField(_("expected season start"))
    sent = models.DateTimeField(_("sent"), default=timezone.now)

    def __str__(self):
        return f"{self.alert!s}: {self.kind!s} {self.season_year}"

    class Meta:
        verbose_name = _("harvest alert delivery")
        verbose_name_plural = _("harvest alert deliveries")
        unique_together = ("alert", "kind", "part", "season_year")
