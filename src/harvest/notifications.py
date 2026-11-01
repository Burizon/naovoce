"""Season news: periodic notifications about seasons that start, run and end."""
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import translation
from django.utils.formats import date_format
from django.utils.html import format_html
from django.utils.translation import ugettext as _, ugettext_noop

from user.models import FruitUser

from . import seasons, services
from .models import SeasonWatch

logger = logging.getLogger(__name__)

# Rendered by user.Message; `lines` is plain text separated by newlines, shown under the title.
SEASON_NEWS_MESSAGE = ugettext_noop("<strong>{title}</strong>\n{lines}")


def _names(items, with_date=None):
    parts = []
    for item in items:
        name = item["kind"].name
        if with_date:
            name += f" ({date_format(getattr(item['window'], with_date), 'j. n.')})"
        parts.append(name)
    return ", ".join(parts)


def news_lines(news):
    """Plain text lines of season news; empty when there is nothing to say."""
    lines = []
    if news[seasons.PHASE_STARTED]:
        lines.append(_("Season has just started: {kinds}").format(kinds=_names(news[seasons.PHASE_STARTED])))
    if news[seasons.PHASE_SOON]:
        lines.append(_("Starting soon: {kinds}").format(kinds=_names(news[seasons.PHASE_SOON], "start")))
    if news[seasons.PHASE_RUNNING]:
        lines.append(_("In season, don't miss it: {kinds}").format(kinds=_names(news[seasons.PHASE_RUNNING])))
    if news[seasons.PHASE_ENDING]:
        lines.append(_("Season ends soon: {kinds}").format(kinds=_names(news[seasons.PHASE_ENDING], "end")))
    if news["ripe_now"]:
        reported = ", ".join(f"{item['kind'].name} ({item['ripe_reports']}×)" for item in news["ripe_now"][:6])
        lines.append(_("People report ripe: {kinds}").format(kinds=reported))
    return lines


def is_due(watch, day):
    return watch.last_sent is None or (day - watch.last_sent).days >= watch.frequency_days


def notify(user, watch, lines):
    title = _("Season news")
    text = "\n".join(lines)
    if watch.via_app:
        user.send_message(SEASON_NEWS_MESSAGE, is_system=True, context={"title": title, "lines": text})
    if watch.via_email and user.email:
        send_mail(
            subject=settings.EMAIL_SUBJECT_PREFIX + title,
            message=text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            html_message=format_html("<h2>{}</h2><p style='white-space:pre-line'>{}</p>", title, text),
            fail_silently=False,
        )


def send_season_news(day=None, dry_run=False):
    """Send season news to every active user whose period has come. Returns the number of notified users."""
    day = day or services.today()
    news_by_lead = {}
    notified = 0

    with translation.override(settings.LANGUAGE_CODE):
        for user in FruitUser.objects.active().order_by("id"):
            watch = SeasonWatch.objects.filter(user=user).prefetch_related("kinds").first() or SeasonWatch(user=user)
            if not (watch.via_app or watch.via_email) or not is_due(watch, day):
                continue

            kinds = list(watch.kinds.all()) if watch.pk else []
            if kinds:
                news = services.season_news(day, watch.lead_days, kinds)
            else:
                if watch.lead_days not in news_by_lead:
                    news_by_lead[watch.lead_days] = services.season_news(day, watch.lead_days)
                news = news_by_lead[watch.lead_days]

            if not (lines := news_lines(news)):
                continue
            logger.info(f"Season news for user {user!s}: {len(lines)} lines.")
            if dry_run:
                notified += 1
                continue

            try:
                with transaction.atomic():
                    watch.last_sent = day
                    watch.save()
                    notify(user, watch, lines)
            except Exception:
                # One failing user (e.g. an unreachable mail server) must not stop the others;
                # last_sent is rolled back, so the next run tries again.
                logger.exception(f"Season news for user {user.id} could not be sent.")
                continue
            notified += 1

    return notified
