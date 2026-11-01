import datetime

import pytest
from django.contrib.gis.geos import Point

from harvest import services
from harvest.models import RipenessReport
from herbarium.models import Herbarium, Season

TODAY = datetime.date(2026, 6, 20)


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    monkeypatch.setattr(services, "today", lambda: TODAY)
    return TODAY


@pytest.fixture
@pytest.mark.django_db
def seasonal_kind(valid_kinds):
    """Valid kind with the given typical seasons; each call takes another kind."""
    taken = []

    def closure(*seasons):
        kind = valid_kinds().exclude(id__in=taken).order_by("id").first()
        taken.append(kind.id)
        herb, _created = Herbarium.objects.get_or_create(kind=kind)
        herb.seasons.all().delete()
        for part, start, duration in seasons:
            Season.objects.create(herb=herb, part=part, start=start, duration=duration)
        return kind

    return closure


@pytest.fixture
def prague_point():
    return lambda dx=0.0, dy=0.0: Point(14.42 + dx, 50.08 + dy, srid=4326)


@pytest.fixture
@pytest.mark.django_db
def report(new_user):
    def closure(fruit, state, observed_on, author=None):
        return RipenessReport.objects.create(
            fruit=fruit,
            author=author or new_user(),
            state=getattr(RipenessReport.STATE, state),
            observed_on=observed_on,
        )

    return closure


@pytest.fixture
def logged_in(client, random_password, new_user):
    def closure(**kwargs):
        password = random_password()
        user = new_user(password=password, **kwargs)
        assert client.login(username=user.username, password=password)
        return user

    return closure
