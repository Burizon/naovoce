import { useCallback, useEffect, useState } from "react";
import { type Notification, type Session, api } from "../api.ts";

const REFRESH_MS = 60_000;

/** In-app notifications (harvest alerts and other messages) behind a bell in the header. */
export function NotificationBell({ session }: { session: Session }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api
      .notifications(session)
      .then(setItems)
      .catch(() => undefined);
  }, [session]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const unread = items.filter((item) => !item.is_read).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      api
        .markNotificationsRead(session)
        .then(() => window.setTimeout(load, 2000))
        .catch(() => undefined);
    }
  }

  return (
    <div className="bell">
      <button
        type="button"
        className="icon-button"
        aria-label={unread ? `Upozornění, nepřečtená: ${unread}` : "Upozornění"}
        aria-expanded={open}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1Z"
          />
        </svg>
        {unread > 0 && <span className="badge">{unread}</span>}
      </button>
      {open && (
        <div className="bell-popover" role="dialog" aria-label="Upozornění">
          <h3>Upozornění</h3>
          {items.length === 0 ? (
            <p className="muted small">Zatím žádná. Zapněte si hlídání sezóny pro kus mapy.</p>
          ) : (
            <ul className="plain notification-list">
              {items.map((item) => (
                <li key={item.id} className={item.is_read ? undefined : "unread"}>
                  {/* Server-rendered and escaped text of the message. */}
                  <span dangerouslySetInnerHTML={{ __html: item.text }} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
