/**
 * NullNotifier — a notifier that drops every event.
 *
 * The default when no side-channel is wired. Keeps the WaveController's notify
 * path uniform without a special-case branch for "no notifier".
 */
import {NotificationEvent, Notifier} from './Notifier.js';

/**
 * A notifier that ignores all events.
 */
export class NullNotifier implements Notifier {

    /**
     * Drop the event.
     * @param {NotificationEvent} _event - The ignored event.
     * @returns {void}
     */
    public notify(_event: NotificationEvent): void {
        // Intentionally does nothing.
    }

}