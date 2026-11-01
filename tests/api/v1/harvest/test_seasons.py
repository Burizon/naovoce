from datetime import date

from harvest import seasons
from harvest.seasons import OVER, RIPE, UNRIPE, Report, SeasonSpec

CHERRY = SeasonSpec("fruit", 6, 2)
SLOE = SeasonSpec("fruit", 10, 3)


def test_season_months_wrap_over_new_year():
    assert seasons.season_months(6, 2) == [6, 7]
    assert seasons.season_months(11, 3) == [11, 12, 1]
    assert seasons.season_months(3, 20) == list(range(3, 13)) + [1, 2]


def test_typical_window_ends_on_last_day_of_month():
    window = seasons.typical_window(SLOE, 2026)

    assert (window.start, window.end) == (date(2026, 10, 1), date(2026, 12, 31))
    assert seasons.typical_window(SeasonSpec("fruit", 12, 2), 2026).end == date(2027, 1, 31)


def test_current_or_next_window():
    assert seasons.current_or_next_window(CHERRY, date(2026, 6, 20)).start == date(2026, 6, 1)
    assert seasons.current_or_next_window(CHERRY, date(2026, 8, 1)).start == date(2027, 6, 1)
    assert seasons.current_or_next_window(SeasonSpec("fruit", 12, 2), date(2027, 1, 10)).start == date(2026, 12, 1)


def test_prediction_falls_back_to_typical_season():
    window = seasons.predicted_window([CHERRY], [], date(2026, 5, 10))

    assert window.source == seasons.SOURCE_TYPICAL
    assert (window.start, window.end) == (date(2026, 6, 1), date(2026, 7, 31))


def test_prediction_from_past_years_uses_medians():
    reports = [
        Report(date(2024, 6, 10), RIPE, 1),
        Report(date(2024, 6, 20), RIPE, 2),
        Report(date(2025, 6, 14), RIPE, 1),
        Report(date(2025, 6, 30), RIPE, 3),
        Report(date(2025, 7, 15), OVER, 3),
    ]

    window = seasons.predicted_window([CHERRY], reports, date(2026, 5, 1))

    assert window.source == seasons.SOURCE_OBSERVED
    assert window.part == "fruit"
    assert window.start == date(2026, 6, 12)
    assert window.end == date(2026, 6, 25)


def test_single_ripe_day_still_makes_a_window():
    window = seasons.predicted_window([], [Report(date(2025, 8, 1), RIPE, 1)], date(2026, 1, 1))

    assert (window.start, window.end) == (date(2026, 8, 1), date(2026, 8, 7))


def test_reports_of_this_year_win():
    reports = [Report(date(2025, 6, 20), RIPE, 1), Report(date(2026, 6, 5), RIPE, 2)]

    window = seasons.predicted_window([CHERRY], reports, date(2026, 6, 6))

    assert window.source == seasons.SOURCE_REPORTED
    assert window.start == date(2026, 6, 5)
    assert window.end == date(2026, 6, 26)


def test_reported_part_is_matched_to_typical_season():
    elder = [SeasonSpec("flowers", 5, 2), SeasonSpec("fruit", 8, 2)]

    window = seasons.predicted_window(elder, [Report(date(2025, 8, 25), RIPE, 1)], date(2026, 3, 1))

    assert window.part == "fruit"


def test_status_prefers_fresh_reports():
    window = seasons.typical_window(CHERRY, 2026)
    day = date(2026, 6, 20)

    assert seasons.status(window, [Report(date(2026, 6, 15), RIPE, 1)], day) == seasons.STATUS_RIPE
    assert seasons.status(window, [Report(date(2026, 6, 15), OVER, 1)], day) == seasons.STATUS_OVER
    assert seasons.status(window, [Report(date(2026, 6, 15), UNRIPE, 1)], day) == seasons.STATUS_UNRIPE
    assert seasons.status(window, [Report(date(2026, 5, 1), RIPE, 1)], day) == seasons.STATUS_IN_SEASON


def test_status_from_window():
    window = seasons.typical_window(SeasonSpec("fruit", 8, 2), 2026)

    assert seasons.status(window, [], date(2026, 7, 15)) == seasons.STATUS_SOON
    assert seasons.status(window, [], date(2026, 5, 1)) == seasons.STATUS_OFF
    assert seasons.status(window, [], date(2026, 8, 15)) == seasons.STATUS_IN_SEASON
    assert seasons.status(None, [], date(2026, 8, 15)) == seasons.STATUS_UNKNOWN


def test_kinds_in_month():
    specs = {1: [CHERRY], 2: [SLOE], 3: []}

    assert seasons.kinds_in_month(specs, 7) == {1}
    assert seasons.kinds_in_month(specs, 12) == {2}
    assert seasons.kinds_in_month(specs, 3) == set()


def test_area_window_is_the_earliest_plant():
    reports = {
        10: [Report(date(2025, 6, 25), RIPE, 1)],
        11: [Report(date(2025, 6, 8), RIPE, 1)],
    }

    windows = seasons.area_windows([CHERRY], reports, [10, 11, 12], date(2026, 5, 1))

    assert [(w.part, w.start) for w in windows] == [("fruit", date(2026, 6, 8))]
