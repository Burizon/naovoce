from datetime import date

import pytest
from rest_framework import status
from rest_framework.reverse import reverse

from harvest.models import RipenessReport


@pytest.mark.django_db
def test_fruit_season_typical(client, seasonal_kind, new_fruit):
    fruit = new_fruit(kind=seasonal_kind(("fruit", 6, 2)))

    response = client.get(reverse("api:fruit-season", args=[fruit.id]))

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["kind"] == fruit.kind.key
    assert data["status"] == "in_season"
    assert data["predicted"] == {"part": "fruit", "start": "2026-06-01", "end": "2026-07-31", "source": "typical"}
    assert data["typical"] == [{"part": "fruit", "start": 6, "duration": 2, "months": [6, 7]}]
    assert data["observed"] == []
    assert data["reports"] == []


@pytest.mark.django_db
def test_fruit_season_with_reports(client, seasonal_kind, new_fruit, report):
    fruit = new_fruit(kind=seasonal_kind(("fruit", 7, 2)))
    report(fruit, "ripe", date(2025, 6, 18))
    report(fruit, "ripe", date(2026, 6, 17))
    report(fruit, "ripe", date(2026, 6, 18))

    data = client.get(reverse("api:fruit-season", args=[fruit.id])).json()

    assert data["status"] == "ripe"
    assert data["predicted"]["source"] == "reported"
    assert data["predicted"]["start"] == "2026-06-17"
    assert data["observed"][0] == {
        "year": 2025,
        "first_ripe": "2025-06-18",
        "last_ripe": "2025-06-18",
        "reports": 1,
        "reporters": 1,
    }
    assert data["recent_votes"] == {"unripe": 0, "ripe": 2, "over": 0}
    assert len(data["reports"]) == 3


@pytest.mark.django_db
def test_report_requires_authentication(client, new_fruit):
    fruit = new_fruit()

    response = client.post(reverse("api:fruit-season", args=[fruit.id]), {"state": "ripe"})

    assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
    assert not RipenessReport.objects.exists()


@pytest.mark.django_db
def test_report_create_then_change_same_day(client, logged_in, seasonal_kind, new_fruit, fixed_today):
    user = logged_in()
    fruit = new_fruit(kind=seasonal_kind(("fruit", 6, 2)))
    url = reverse("api:fruit-season", args=[fruit.id])

    created = client.post(url, {"state": "unripe", "note": "still green"}, content_type="application/json")
    changed = client.post(url, {"state": "ripe"}, content_type="application/json")

    assert created.status_code == status.HTTP_201_CREATED
    assert changed.status_code == status.HTTP_200_OK
    assert changed.json()["status"] == "ripe"
    stored = RipenessReport.objects.get()
    assert (stored.author, stored.observed_on, stored.state) == (user, fixed_today, RipenessReport.STATE.ripe)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "payload",
    [
        {"state": "rotten"},
        {"state": "ripe", "observed_on": "2026-06-21"},
        {"state": "ripe", "observed_on": "2026-01-01"},
    ],
)
def test_report_validation(client, logged_in, new_fruit, payload):
    logged_in()
    fruit = new_fruit()

    response = client.post(reverse("api:fruit-season", args=[fruit.id]), payload, content_type="application/json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert not RipenessReport.objects.exists()


@pytest.mark.django_db
def test_season_of_deleted_fruit_not_found(client, new_fruit):
    fruit = new_fruit(deleted=True)

    response = client.get(reverse("api:fruit-season", args=[fruit.id]))

    assert response.status_code == status.HTTP_404_NOT_FOUND
