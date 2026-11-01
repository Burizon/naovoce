from django.urls import path

from .views import MyMessages, MyMessagesRead, UserDetail, UserList, UserListTop, UserListTopLastMonth

urlpatterns = [
    path("", UserList.as_view(), name="users-list"),
    path("top/", UserListTop.as_view(), name="users-list-top"),
    path(
        "top/last-month/",
        UserListTopLastMonth.as_view(),
        name="users-list-top-last-month",
    ),
    path("<int:pk>/", UserDetail.as_view(), name="users-detail"),
    path("me/messages/", MyMessages.as_view(), name="users-me-messages"),
    path("me/messages/read/", MyMessagesRead.as_view(), name="users-me-messages-read"),
]
