import logging

from django.conf import settings
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


class SeasonWatch(TimeStampedModel):
    """User's season news: which kinds to follow, how far ahead, how often and through which channel.

    Users without a row get the defaults: all kinds, a month ahead, every 14 days, in the app only.
    """

    LEAD = Choices(
        two_weeks=(14, _("two weeks ahead")),
        month=(30, _("a month ahead")),
        two_months=(60, _("two months ahead")),
    )
    FREQUENCY = Choices(
        weekly=(7, _("every week")),
        fortnightly=(14, _("every 14 days")),
        monthly=(30, _("every month")),
    )

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        verbose_name=_("user"),
        related_name="season_watch",
        on_delete=models.CASCADE,
    )
    kinds = models.ManyToManyField(
        "fruit.Kind",
        verbose_name=_("kinds"),
        related_name="season_watches",
        blank=True,
        help_text=_("Leave empty to follow all kinds."),
    )
    lead_days = models.PositiveSmallIntegerField(_("announce ahead"), choices=LEAD.choices, default=LEAD.month)
    frequency_days = models.PositiveSmallIntegerField(
        _("season news frequency"), choices=FREQUENCY.choices, default=FREQUENCY.fortnightly
    )
    via_app = models.BooleanField(_("notify in the app"), default=True)
    via_email = models.BooleanField(_("notify by e-mail"), default=False)
    last_sent = models.DateField(_("last season news"), null=True, blank=True)

    def __str__(self):
        return f"{self.user!s}"

    class Meta:
        verbose_name = _("season watch")
        verbose_name_plural = _("season watches")
