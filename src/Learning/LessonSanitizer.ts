/**
 * LessonSanitizer — deterministic, pattern-based detection of content that must
 * never cross project boundaries.
 *
 * It flags secrets/credentials, personal data (emails) and project-internal
 * hosts (IPv4 literals) in a lesson's human-readable text. Detection is
 * heuristic but deterministic (no AI); a flagged lesson is refused by
 * LessonTransfer rather than being silently shared.
 */
import {Lesson} from '../Domain/Lesson.js';

interface SensitivePattern {
    label: string;
    regex: RegExp;
}

const PATTERNS: SensitivePattern[] = [
    {label: 'email', regex: /[\w.+-]+@[\w-]+\.[\w.-]+/u},
    {label: 'secret', regex: /(?:password|secret|api[_-]?key|token|credential)\s*[:=]/iu},
    {label: 'ipv4', regex: /\b\d{1,3}(?:\.\d{1,3}){3}\b/u}
];

/**
 * Static scanner for sensitive content in lessons.
 */
export class LessonSanitizer {

    /**
     * Find sensitive-content labels across the given texts.
     * @param {string[]} texts - Texts to scan.
     * @returns {string[]} Sorted, de-duplicated labels of what was found.
     */
    public static findSensitive(texts: string[]): string[] {
        const findings = new Set<string>();

        for (const text of texts) {
            for (const pattern of PATTERNS) {
                if (pattern.regex.test(text)) {
                    findings.add(pattern.label);
                }
            }
        }

        return [...findings].sort();
    }

    /**
     * Inspect a lesson's transferable text for sensitive content.
     * @param {Lesson} lesson - The lesson to inspect.
     * @returns {string[]} Sorted labels of any sensitive content found.
     */
    public static inspect(lesson: Lesson): string[] {
        return LessonSanitizer.findSensitive([lesson.statement, ...lesson.conditions, ...lesson.knownLimits]);
    }

}