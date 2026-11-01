"""Announcing harvest season starts to users watching map areas."""
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import translation
from django.utils.formats import date_format
from django.utils.html import format_html
from django.utils.translation import ugettext as _, ugettext_noop

from . import services
from .models import HarvestAlert, HarvestAlertDelivery

logger = logging.getLogger(__name__)

ALERT_MESSAGE = ugettext_noop("Harvest season is starting in your watched area <strong>{area}</strong>: {kinds}")

# A season that started more than this many days ago is not "starting" any more; an alert created
# in the middle of a season waits for the next one instead of announcing old news.
RECENT_START_DAYS = 7


def due_windows(alert, day):
    """(kind, window, plant count) whose start minus lead time has come and that were not announced yet."""
    announced = set(alert.deliveries.values_list("kind_id", "part", "season_year"))
    due = []
    for row in services.area_overview(alert.area, list(alert.kinds.all()) or None, day):
        for window in row["windows"]:
            key = (row["kind"].id, window.part, window.start.year)
            starts_soon = -RECENT_START_DAYS <= (window.start - day).days <= alert.lead_days
            if key not in announced and starts_soon and window.end >= day:
                due.append((row["kind"], window, row["count"]))
    return due


def describe(due):
    """Plain text list of kinds with expected start; escaped when rendered into the message HTML."""
    return ", ".join(f"{kind.name} ({date_format(window.start, 'j. n.')}, {count}×)" for kind, window, count in due)


def notify(alert, due):
    kinds = describe(due)
    alert.user.send_message(ALERT_MESSAGE, is_system=True, context={"area": alert.name, "kinds": kinds})

    if alert.via_email and alert.user.email:
        with translation.override(settings.LANGUAGE_CODE):
            body = format_html(_(ALERT_MESSAGE), area=alert.name, kinds=kinds)
            send_mail(
                subject=settings.EMAIL_SUBJECT_PREFIX + _("Harvest season is starting"),
                message=body.replace("<strong>", "").replace("</strong>", ""),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[alert.user.email],
                html_message=body,
                fail_silently=False,
            )


def send_due_alerts(day=None, dry_run=False):
    """Announce every due season once. Returns the number of notified alerts."""
    day = day or services.today()
    notified = 0
    alerts = HarvestAlert.objects.filter(is_active=True, user__is_active=True).select_related("user")

    for alert in alerts.prefetch_related("kinds"):
        if not (due := due_windows(alert, day)):
            continue

        logger.info(
            "Harvest alert {alert_id} of user {user!s}: {kinds}.".format(
                alert_id=alert.id,
                user=alert.user,
                kinds=", ".join(f"{kind.key}@{window.start:%Y-%m-%d}" for kind, window, _count in due),
            )
        )
        if dry_run:
            notified += 1
            continue

        try:
            with transaction.atomic():
                HarvestAlertDelivery.objects.bulk_create(
                    HarvestAlertDelivery(
                        alert=alert,
                        kind=kind,
                        part=window.part,
                        season_year=window.start.year,
                        season_start=window.start,
                    )
                    for kind, window, _count in due
                )
                notify(alert, due)
        except Exception:
            # One failing alert (e.g. an unreachable mail server) must not stop the others;
            # its deliveries are rolled back, so the next run tries it again.
            logger.exception(f"Harvest alert {alert.id} could not be sent.")
            continue
        notified += 1

    return notified
