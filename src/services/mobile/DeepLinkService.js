/**
 * DeepLinkService — Deep Link Routing
 *
 * Handles borisend:// scheme deep links and maps them to in-app routes.
 *
 * DEEP LINK ROUTES:
 *   borisend://message/{id}              → /messages/{id}
 *   borisend://communication-plan/{id}   → /campaigns/{id}
 *   borisend://notification/{id}         → /notifications?id={id}
 *   borisend://subscription              → /subscription
 *   borisend://referrals                 → /referrals
 *
 * Sprint 8: Added referrals route.
 * Deep-link formats unchanged — referrals is a new addition.
 *
 * When a push notification is tapped, the payload carries a deep_link
 * field. The LifecycleService fires a 'notificationOpened' event,
 * which triggers DeepLinkService.handle() to navigate the user
 * to the correct screen.
 */

const SCHEME = "borisend";

const ROUTE_BUILDERS = {
  message: (id) => (id ? `/messages/${id}` : null),
  "communication-plan": (id) => (id ? `/campaigns/${id}` : null),
  notification: (id) => (id ? `/notifications?id=${id}` : "/notifications"),
  subscription: () => "/settings",
  referrals: () => "/settings",
  // Mobile-store builds are consumption-only. Add-on reminders open membership status,
  // never an in-app renewal or purchase experience.
  "addon-renewal": () => "/settings",
};

const DeepLinkService = {
  _handler: null,

  /**
   * Parse a deep link URL into a navigation route.
   * @param {string} url — e.g. "borisend://message/abc123"
   * @returns {{route: string, type: string, id: string|null} | null}
   */
  parse(url) {
    if (!url || typeof url !== "string") return null;

    // Match borisend://type or borisend://type/id
    const match = url.match(new RegExp(`^${SCHEME}://([^/?#]+)(?:/(.+))?`));
    if (!match) return null;

    const type = match[1];
    const id = match[2] ? decodeURIComponent(match[2]) : null;

    const builder = ROUTE_BUILDERS[type];
    if (!builder) return null;

    const route = builder(id);
    if (!route) return null;

    return { route, type, id };
  },

  /**
   * Register a handler for incoming deep links.
   * Typically called once at app startup by DeepLinkHandler component.
   * @param {(parsed: {route, type, id}) => void} handler
   */
  register(handler) {
    this._handler = handler;
  },

  /**
   * Handle an incoming deep link URL.
   * @returns {boolean} — true if the link was successfully parsed and handled
   */
  handle(url) {
    const parsed = this.parse(url);
    if (parsed && this._handler) {
      this._handler(parsed);
      return true;
    }
    return false;
  },

  /**
   * Build a deep link URL from a type and optional id.
   * @param {string} type — 'message' | 'communication-plan' | 'notification' | 'subscription' | 'referrals'
   * @param {string|null} id
   * @returns {string}
   */
  build(type, id = null) {
    const base = `${SCHEME}://${type}`;
    return id ? `${base}/${id}` : base;
  },

  /**
   * Build a notification payload that carries a deep link.
   * Used when constructing push notification data.
   *
   * @param {string} type — deep link type
   * @param {string|null} id — entity id
   * @param {object} extra — additional payload fields
   * @returns {object} — { deep_link, type, id, ...extra }
   */
  buildNotificationPayload(type, id = null, extra = {}) {
    return {
      deep_link: this.build(type, id),
      type,
      id,
      ...extra,
    };
  },
};

export default DeepLinkService;