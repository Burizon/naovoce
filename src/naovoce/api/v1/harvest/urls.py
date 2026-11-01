from django.urls import path

from .views import HarvestCalendar, MySeasonWatch, SeasonNews

urlpatterns = [
    path("calendar/", HarvestCalendar.as_view(), name="harvest-calendar"),
    path("news/", SeasonNews.as_view(), name="harvest-news"),
    path("watch/", MySeasonWatch.as_view(), name="harvest-watch"),
]
