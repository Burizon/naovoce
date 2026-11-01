import pytest
from rest_framework import status
from rest_framework.reverse import reverse

from harvest.notifications import SEASON_NEWS_MESSAGE


@pytest.mark.django_db
def test_my_messages_lists_notifications_newest_first(client, random_password, new_user):
    password = random_password()
    user = new_user(password=password)
    user.send_message(
        SEASON_NEWS_MESSAGE, is_system=True, context={"title": "Sezónní zprávy", "lines": "Třešeň (1. 6.)"}
    )
    assert client.login(username=user.username, password=password)

    response = client.get(reverse("api:users-me-messages"))

    assert response.status_code == status.HTTP_200_OK
    messages = response.json()
    # The welcome message comes first on registration, the harvest alert is newer.
    assert len(messages) == 2
    assert "<strong>Sezónní zprávy</strong>" in messages[0]["text"]
    assert "Třešeň (1. 6.)" in messages[0]["text"]
    assert messages[0]["is_read"] is False


@pytest.mark.django_db
def test_my_messages_escapes_context(client, random_password, new_user):
    password = random_password()
    user = new_user(password=password)
    user.send_message(SEASON_NEWS_MESSAGE, is_system=True, context={"title": "<script>x</script>", "lines": "a"})
    assert client.login(username=user.username, password=password)

    text = client.get(reverse("api:users-me-messages")).json()[0]["text"]

    assert "<script>" not in text
    assert "&lt;script&gt;" in text


@pytest.mark.django_db
def test_mark_messages_read(client, random_password, new_user):
    password = random_password()
    user = new_user(password=password)
    assert client.login(username=user.username, password=password)

    assert client.get(reverse("api:users-me-messages"), {"unread": ""}).json() != []
    assert client.post(reverse("api:users-me-messages-read")).status_code == status.HTTP_204_NO_CONTENT
    assert client.get(reverse("api:users-me-messages"), {"unread": ""}).json() == []


@pytest.mark.django_db
def test_my_messages_require_login(client):
    response = client.get(reverse("api:users-me-messages"))

    assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
