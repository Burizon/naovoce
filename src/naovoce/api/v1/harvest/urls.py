from django.urls import path

from .views import HarvestAlertDetail, HarvestAlertList, HarvestArea, HarvestCalendar

urlpatterns = [
    path("calendar/", HarvestCalendar.as_view(), name="harvest-calendar"),
    path("area/", HarvestArea.as_view(), name="harvest-area"),
    path("alerts/", HarvestAlertList.as_view(), name="harvest-alert-list"),
    path("alerts/<int:pk>/", HarvestAlertDetail.as_view(), name="harvest-alert-detail"),
]
