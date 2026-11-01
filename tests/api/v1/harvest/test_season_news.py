from datetime import date

import pytest
from django.core.management import call_command
from rest_framework import status
from rest_framework.reverse import reverse

from fruit.models import Fruit
from harvest import notifications
from harvest.models import SeasonWatch
from harvest.notifications import send_season_news


@pytest.fixture
@pytest.mark.django_db
def only_users(django_user_model):
    """Season news go to every active user; keep just the ones a test creates."""
    django_user_model.objects.all().delete()


@pytest.mark.django_db
def test_season_news_api_groups_kinds_by_phase(client, truncate_table, seasonal_kind, new_fruit, report):
    truncate_table(Fruit)
    cherry = seasonal_kind(("fruit", 6, 2))  # started 1. 6.
    walnut = seasonal_kind(("nuts", 7, 1))  # starts 1. 7.
    unmapped = seasonal_kind(("fruit", 6, 1))  # no places on the map
    tree = new_fruit(kind=cherry)
    new_fruit(kind=walnut)
    report(tree, "ripe", date(2026, 6, 18))

    response = client.get(reverse("api:harvest-news"))

    assert response.status_code == status.HTTP_200_OK
    news = response.json()
    assert news["date"] == "2026-06-20"
    assert [item["kind"] for item in news["soon"]] == [walnut.key]
    assert [item["kind"] for item in news["ripe_now"]] == [cherry.key]
    assert news["ripe_now"][0]["ripe_reports"] == 1
    phases = {item["kind"]: phase for phase in ("started", "running", "ending") for item in news[phase]}
    assert cherry.key in phases and unmapped.key not in phases
    assert client.get(reverse("api:harvest-news"), {"lead_days": "abc"}).status_code == 400


@pytest.mark.django_db
def test_watch_settings_have_defaults_and_can_change(client, logged_in, seasonal_kind):
    logged_in()
    cherry = seasonal_kind(("fruit", 6, 2))

    defaults = client.get(reverse("api:harvest-watch")).json()
    changed = client.put(
        reverse("api:harvest-watch"),
        {"kinds": [cherry.key], "lead_days": 60, "frequency_days": 7, "via_app": True, "via_email": True},
        content_type="application/json",
    )

    assert defaults == {
        "kinds": [],
        "lead_days": 30,
        "frequency_days": 14,
        "via_app": True,
        "via_email": False,
        "last_sent": None,
    }
    assert changed.status_code == status.HTTP_200_OK
    assert changed.json()["kinds"] == [cherry.key]
    invalid = client.put(
        reverse("api:harvest-watch"), {"lead_days": 45, "frequency_days": 7}, content_type="application/json"
    )
    assert invalid.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_watch_requires_login(client):
    response = client.get(reverse("api:harvest-watch"))

    assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


@pytest.mark.django_db
def test_every_user_gets_season_news_by_default(only_users, new_user, seasonal_kind, new_fruit, mailoutbox):
    cherry = seasonal_kind(("fruit", 6, 2))
    new_fruit(kind=cherry)
    reader = new_user()

    assert send_season_news(day=date(2026, 6, 3)) == 2  # the reader and the owner of the plant

    message = reader.messages.filter(is_system=True).first()
    assert message.context["title"] == "Season news"
    assert cherry.name in message.context["lines"]
    assert not [mail for mail in mailoutbox if mail.to == [reader.email]]


@pytest.mark.django_db
def test_season_news_respect_frequency(only_users, new_user, seasonal_kind, new_fruit):
    new_fruit(kind=seasonal_kind(("fruit", 6, 2)))
    SeasonWatch.objects.create(user=new_user(), frequency_days=7)

    assert send_season_news(day=date(2026, 6, 3)) == 2
    assert send_season_news(day=date(2026, 6, 9)) == 0
    assert send_season_news(day=date(2026, 6, 10)) == 1  # weekly watcher; default owner waits 14 days


@pytest.mark.django_db
def test_season_news_follow_chosen_kinds_and_channels(
    only_users, new_user, seasonal_kind, new_fruit, mailoutbox, settings
):
    settings.LANGUAGE_CODE = "cs"
    cherry = seasonal_kind(("fruit", 6, 2))
    walnut = seasonal_kind(("nuts", 7, 1))
    for kind in (cherry, walnut):
        new_fruit(kind=kind)
    watcher = new_user()
    watch = SeasonWatch.objects.create(user=watcher, via_app=False, via_email=True)
    watch.kinds.set([walnut])
    silent = SeasonWatch.objects.create(user=new_user(), via_app=False, via_email=False)

    send_season_news(day=date(2026, 6, 3))

    mails = [mail for mail in mailoutbox if mail.to == [watcher.email]]
    assert len(mails) == 1
    assert "Sezónní zprávy" in mails[0].subject
    assert walnut.name in mails[0].body and cherry.name not in mails[0].body
    assert not watcher.messages.filter(is_system=True, text=notifications.SEASON_NEWS_MESSAGE).exists()
    assert not silent.user.messages.filter(text=notifications.SEASON_NEWS_MESSAGE).exists()


@pytest.mark.django_db
def test_failing_user_does_not_stop_others(only_users, new_user, seasonal_kind, new_fruit, monkeypatch):
    new_fruit(kind=seasonal_kind(("fruit", 6, 2)))
    broken, working = new_user(), new_user()
    real_notify = notifications.notify

    def flaky_notify(user, watch, lines):
        if user == broken:
            raise ConnectionError("SMTP down")
        real_notify(user, watch, lines)

    monkeypatch.setattr(notifications, "notify", flaky_notify)

    assert send_season_news(day=date(2026, 6, 3)) == 2  # working user and the plant owner
    assert not SeasonWatch.objects.filter(user=broken, last_sent__isnull=False).exists()
    assert SeasonWatch.objects.get(user=working).last_sent == date(2026, 6, 3)


@pytest.mark.django_db
def test_nothing_to_say_sends_nothing(only_users, new_user, seasonal_kind, new_fruit):
    new_fruit(kind=seasonal_kind(("fruit", 6, 2)))
    new_user()

    assert send_season_news(day=date(2026, 2, 1)) == 0


@pytest.mark.django_db
def test_send_command_dry_run(only_users, new_user, seasonal_kind, new_fruit, capsys):
    new_fruit(kind=seasonal_kind(("fruit", 6, 2)))

    call_command("send_season_news", "--date", "2026-06-03", "--dry-run")

    assert "Notified users: 1" in capsys.readouterr().out
    assert not SeasonWatch.objects.exists()
