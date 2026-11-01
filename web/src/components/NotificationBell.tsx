import { useCallback, useEffect, useState } from "react";
import { type Notification, type Session, api } from "../api.ts";

const REFRESH_MS = 60_000;
const TOAST_MS = 15_000;
const SEEN_KEY = "naovoce.lastToast";

function lastToastId(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0);
  } catch {
    return 0;
  }
}

function rememberToast(id: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(id));
  } catch {
    // Without storage the pop-up may show again after reload; harmless.
  }
}

interface Props {
  session: Session;
  onSettings: () => void;
}

/** In-app notifications (season news and other messages) behind a bell, with a pop-up for new ones. */
export function NotificationBell({ session, onSettings }: Props) {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notification | null>(null);

  const load = useCallback(() => {
    api
      .notifications(session)
      .then((list) => {
        setItems(list);
        const newest = list.find((item) => !item.is_read);
        if (newest && newest.id > lastToastId()) {
          rememberToast(newest.id);
          setToast(newest);
        }
      })
      .catch(() => undefined);
  }, [session]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const unread = items.filter((item) => !item.is_read).length;

  function openList() {
    setToast(null);
    setOpen(true);
    if (unread > 0) {
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
        onClick={() => (open ? setOpen(false) : openList())}
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
          <div className="popover-head">
            <h3>Upozornění</h3>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
            >
              Nastavení zpráv
            </button>
          </div>
          {items.length === 0 ? (
            <p className="muted small">Zatím žádná. Sezónní zprávy chodí podle vašeho nastavení.</p>
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

      {toast && !open && (
        <div className="toast" role="status">
          <button type="button" className="icon-button toast-close" aria-label="Zavřít" onClick={() => setToast(null)}>
            ×
          </button>
          <span className="toast-text" dangerouslySetInnerHTML={{ __html: toast.text }} />
          <button type="button" className="link-button" onClick={openList}>
            Zobrazit upozornění
          </button>
        </div>
      )}
    </div>
  );
}
