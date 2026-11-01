import datetime

from django.core.management.base import BaseCommand, CommandError

from harvest.notifications import send_due_alerts


class Command(BaseCommand):
    help = "Notify users whose watched map areas reach the start of a harvest season. Run once a day."  # noqa:A003

    def add_arguments(self, parser):
        parser.add_argument("--date", help="Evaluate as if today was YYYY-MM-DD.")
        parser.add_argument("--dry-run", action="store_true", help="Only log what would be sent.")

    def handle(self, *args, **options):
        day = None
        if options["date"]:
            try:
                day = datetime.date.fromisoformat(options["date"])
            except ValueError:
                raise CommandError("--date must be YYYY-MM-DD.")

        notified = send_due_alerts(day=day, dry_run=options["dry_run"])
        self.stdout.write(f"Notified alerts: {notified}")
