/**
 * Notifier — a side-channel for rollout progress events.
 *
 * Notifications are advisory: they never influence a result or the control
 * flow. The WaveController wraps every dispatch so a throwing or slow notifier
 * cannot change the rollout, and it redacts any message that trips the secret
 * scanner. Events carry only ids, indices and states — never a host, address or
 * free text that could leak a secret.
 */
import {WaveState} from '../Domain/Common.js';

/**
 * The kind of a rollout notification.
 */
export enum NotificationKind {
    RolloutStarted = 'rollout_started',
    WavePassed = 'wave_passed',
    WaveFailed = 'wave_failed',
    WaveBlocked = 'wave_blocked',
    RolloutCompleted = 'rollout_completed'
}

/**
 * A single rollout notification event.
 */
export interface NotificationEvent {

    /**
     * What happened.
     * @member {NotificationKind}
     */
    kind: NotificationKind;

    /**
     * The rollout (WaveRun) id this event belongs to.
     * @member {string}
     */
    waveRunId: string;

    /**
     * The wave index, for wave-level events.
     * @member {number|undefined}
     */
    waveIndex?: number;

    /**
     * The wave state, for wave-level events.
     * @member {WaveState|undefined}
     */
    waveState?: WaveState;

    /**
     * The overall rollout state, for the completion event.
     * @member {WaveState|undefined}
     */
    rolloutState?: WaveState;

    /**
     * A short, id/state-only human message (redacted if it trips the scanner).
     * @member {string}
     */
    message: string;
}

/**
 * A sink for rollout notifications.
 */
export interface Notifier {

    /**
     * Receive a notification. Must not throw into the caller; the caller still
     * guards the call, but implementations should be side-effect-safe.
     * @param {NotificationEvent} event - The event to deliver.
     * @returns {void}
     */
    notify(event: NotificationEvent): void;
}