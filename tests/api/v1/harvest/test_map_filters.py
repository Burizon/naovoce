from datetime import date

import pytest
from rest_framework import status
from rest_framework.reverse import reverse

from fruit.models import Fruit


def ids(response):
    return {item["id"] for item in response.json()}


@pytest.mark.django_db
def test_fruit_list_month_filter(client, truncate_table, seasonal_kind, new_fruit):
    truncate_table(Fruit)
    cherry = new_fruit(kind=seasonal_kind(("fruit", 6, 2)))
    sloe = new_fruit(kind=seasonal_kind(("fruit", 10, 3)))
    elder = new_fruit(kind=seasonal_kind(("flowers", 5, 2), ("fruit", 8, 2)))

    def listed(month):
        response = client.get(reverse("api:fruit-list"), {"month": month})
        assert response.status_code == status.HTTP_200_OK
        return ids(response)

    assert listed(6) == {cherry.id, elder.id}
    assert listed(12) == {sloe.id}
    assert listed(8) == {elder.id}
    assert listed("now") == {cherry.id, elder.id}


@pytest.mark.django_db
@pytest.mark.parametrize("month", ["0", "13", "june"])
def test_fruit_list_bad_month(client, month):
    response = client.get(reverse("api:fruit-list"), {"month": month})

    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_fruit_list_reported_ripe(client, truncate_table, new_fruit, report):
    truncate_table(Fruit)
    ripe, overripe, stale, unknown = (new_fruit() for _ in range(4))
    report(ripe, "ripe", date(2026, 6, 18))
    report(overripe, "ripe", date(2026, 6, 12))
    report(overripe, "over", date(2026, 6, 19))
    report(stale, "ripe", date(2026, 5, 1))

    response = client.get(reverse("api:fruit-list"), {"ripe": "1"})

    assert response.status_code == status.HTTP_200_OK
    assert ids(response) == {ripe.id}


@pytest.mark.django_db
def test_harvest_calendar(client, truncate_table, seasonal_kind, new_fruit, report, prague_point):
    truncate_table(Fruit)
    cherry_kind = seasonal_kind(("fruit", 6, 2))
    tree = new_fruit(kind=cherry_kind, position=prague_point())
    new_fruit(kind=cherry_kind, position=prague_point(dx=3))
    report(tree, "ripe", date(2025, 6, 18))
    report(tree, "ripe", date(2026, 6, 2))

    everything = client.get(reverse("api:harvest-calendar")).json()
    local = client.get(reverse("api:harvest-calendar"), {"bbox": "14.3,50.0,14.6,50.2"}).json()

    cherry = next(row for row in everything if row["kind"] == cherry_kind.key)
    assert cherry["count"] == 2
    assert cherry["typical"] == [{"part": "fruit", "start": 6, "duration": 2, "months": [6, 7]}]
    assert cherry["ripe_reports_by_month"] == [0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0]
    assert [row["kind"] for row in local] == [cherry_kind.key]
    assert local[0]["count"] == 1


@pytest.mark.django_db
def test_harvest_area_requires_small_bbox(client):
    assert client.get(reverse("api:harvest-area")).status_code == status.HTTP_400_BAD_REQUEST
    assert client.get(reverse("api:harvest-area"), {"bbox": "12,48,19,51"}).status_code == 400
    assert client.get(reverse("api:harvest-area"), {"bbox": "a,b,c,d"}).status_code == 400
