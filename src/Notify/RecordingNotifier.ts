/**
 * RecordingNotifier — collects events in order.
 *
 * Useful in tests and for an in-process audit of what was emitted. It keeps a
 * copy of each event; callers read the collected list after a rollout.
 */
import {NotificationEvent, Notifier} from './Notifier.js';

/**
 * A notifier that remembers every event it received.
 */
export class RecordingNotifier implements Notifier {

    /**
     * The events received so far, in order.
     * @member {NotificationEvent[]}
     */
    protected readonly _events: NotificationEvent[] = [];

    /**
     * Record the event.
     * @param {NotificationEvent} event - The event to remember.
     * @returns {void}
     */
    public notify(event: NotificationEvent): void {
        this._events.push({...event});
    }

    /**
     * The recorded events, in order.
     * @returns {NotificationEvent[]} A copy of the collected events.
     */
    public events(): NotificationEvent[] {
        return [...this._events];
    }

}