from datetime import date

import pytest
from django.contrib.gis.geos import Polygon
from django.core.management import call_command
from rest_framework import status
from rest_framework.reverse import reverse

from harvest.models import HarvestAlert, HarvestAlertDelivery
from harvest.notifications import send_due_alerts

PRAGUE_BBOX = [14.3, 50.0, 14.6, 50.2]


@pytest.fixture
@pytest.mark.django_db
def alert(new_user):
    def closure(user=None, kinds=(), bbox=PRAGUE_BBOX, **kwargs):
        alert = HarvestAlert.objects.create(
            user=user or new_user(), name="Stromovka", area=Polygon.from_bbox(bbox), **kwargs
        )
        alert.kinds.set(kinds)
        return alert

    return closure


@pytest.mark.django_db
def test_create_alert_with_overview(client, logged_in, seasonal_kind, new_fruit, prague_point):
    user = logged_in()
    cherry = seasonal_kind(("fruit", 7, 1))
    new_fruit(kind=cherry, position=prague_point())

    response = client.post(
        reverse("api:harvest-alert-list"),
        {"name": "Stromovka", "bbox": PRAGUE_BBOX, "kinds": [cherry.key], "lead_days": 5},
        content_type="application/json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["bbox"] == PRAGUE_BBOX
    assert data["kinds"] == [cherry.key]
    assert data["overview"] == [
        {
            "kind": cherry.key,
            "name": cherry.name,
            "col": cherry.color,
            "count": 1,
            "windows": [{"part": "fruit", "start": "2026-07-01", "end": "2026-07-31", "source": "typical"}],
        }
    ]
    assert HarvestAlert.objects.get().user == user


@pytest.mark.django_db
@pytest.mark.parametrize(
    "payload",
    [
        {"name": "Celá republika", "bbox": [12.0, 48.5, 19.0, 51.0]},
        {"name": "Obráceně", "bbox": [14.6, 50.0, 14.3, 50.2]},
        {"name": "Neúplné", "bbox": [14.3, 50.0, 14.6]},
        {"name": "Neznámý druh", "bbox": PRAGUE_BBOX, "kinds": ["zzzz"]},
        {"name": "Dlouho dopředu", "bbox": PRAGUE_BBOX, "lead_days": 61},
    ],
)
def test_create_alert_validation(client, logged_in, payload):
    logged_in()

    response = client.post(reverse("api:harvest-alert-list"), payload, content_type="application/json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_alerts_are_private(client, logged_in, alert, new_user):
    user = logged_in()
    own = alert(user=user)
    foreign = alert(user=new_user())

    listed = client.get(reverse("api:harvest-alert-list")).json()

    assert [item["id"] for item in listed] == [own.id]
    assert client.get(reverse("api:harvest-alert-detail", args=[foreign.id])).status_code == 404
    assert client.delete(reverse("api:harvest-alert-detail", args=[foreign.id])).status_code == 404
    assert client.delete(reverse("api:harvest-alert-detail", args=[own.id])).status_code == 204
    assert list(HarvestAlert.objects.all()) == [foreign]


@pytest.mark.django_db
def test_alerts_require_login(client):
    response = client.get(reverse("api:harvest-alert-list"))

    assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


@pytest.mark.django_db
def test_alert_is_sent_once_when_season_comes(alert, seasonal_kind, new_fruit, prague_point, mailoutbox, settings):
    settings.LANGUAGE_CODE = "cs"
    cherry = seasonal_kind(("fruit", 7, 1))
    new_fruit(kind=cherry, position=prague_point())
    watch = alert(kinds=[cherry], lead_days=3)

    assert send_due_alerts(day=date(2026, 6, 27)) == 0
    assert send_due_alerts(day=date(2026, 6, 28)) == 1
    assert send_due_alerts(day=date(2026, 7, 2)) == 0

    delivery = HarvestAlertDelivery.objects.get()
    assert (delivery.kind, delivery.season_year, delivery.season_start) == (cherry, 2026, date(2026, 7, 1))
    message = watch.user.messages.filter(is_system=True).first()
    assert message.context["area"] == "Stromovka"
    assert cherry.name in message.context["kinds"]
    # Registration of test users notifies admins; only the user's mail matters here.
    mails = [mail for mail in mailoutbox if mail.to == [watch.user.email]]
    assert len(mails) == 1
    assert "sklizně" in mails[0].subject
    assert cherry.name in mails[0].body
    assert "Stromovka" in mails[0].body


@pytest.mark.django_db
def test_alert_uses_observed_start_of_the_area(alert, seasonal_kind, new_fruit, prague_point, report):
    cherry = seasonal_kind(("fruit", 7, 1))
    early_tree = new_fruit(kind=cherry, position=prague_point())
    report(early_tree, "ripe", date(2025, 6, 10))
    alert(kinds=[cherry], lead_days=0, via_email=False)

    assert send_due_alerts(day=date(2026, 6, 9)) == 0
    assert send_due_alerts(day=date(2026, 6, 10)) == 1


@pytest.mark.django_db
def test_alert_ignores_other_areas_and_inactive_alerts(alert, seasonal_kind, new_fruit, prague_point):
    cherry = seasonal_kind(("fruit", 6, 2))
    new_fruit(kind=cherry, position=prague_point())
    alert(kinds=[cherry], bbox=[16.5, 49.1, 16.7, 49.3])
    alert(kinds=[cherry], is_active=False)

    assert send_due_alerts(day=date(2026, 6, 3)) == 0


@pytest.mark.django_db
def test_watching_all_kinds_in_area(alert, seasonal_kind, new_fruit, prague_point):
    cherry = seasonal_kind(("fruit", 6, 2))
    walnut = seasonal_kind(("nuts", 9, 2))
    new_fruit(kind=cherry, position=prague_point())
    new_fruit(kind=walnut, position=prague_point(dy=0.01))
    watch = alert(via_email=False)

    assert send_due_alerts(day=date(2026, 6, 3)) == 1
    assert set(watch.deliveries.values_list("kind", flat=True)) == {cherry.id}


@pytest.mark.django_db
def test_send_command_dry_run(alert, seasonal_kind, new_fruit, prague_point, capsys):
    cherry = seasonal_kind(("fruit", 6, 2))
    new_fruit(kind=cherry, position=prague_point())
    alert(kinds=[cherry])

    call_command("send_harvest_alerts", "--date", "2026-06-03", "--dry-run")

    assert "Notified alerts: 1" in capsys.readouterr().out
    assert not HarvestAlertDelivery.objects.exists()


@pytest.mark.django_db
def test_alert_created_mid_season_waits_for_next_start(alert, seasonal_kind, new_fruit, prague_point):
    cherry = seasonal_kind(("fruit", 6, 2))
    new_fruit(kind=cherry, position=prague_point())
    alert(kinds=[cherry], via_email=False)

    assert send_due_alerts(day=date(2026, 6, 8)) == 1
    assert send_due_alerts(day=date(2026, 6, 9)) == 0
    HarvestAlertDelivery.objects.all().delete()
    assert send_due_alerts(day=date(2026, 6, 9)) == 0
