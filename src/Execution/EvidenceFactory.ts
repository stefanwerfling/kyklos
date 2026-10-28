/**
 * EvidenceFactory — builds evidence with an explicit provenance tier.
 *
 * Every piece of evidence carries its source, so an LLM assertion can never be
 * mistaken for a machine-verified result, and a not-executable check keeps a
 * visible record instead of silently vanishing.
 */
import {EvidenceSource, EvidenceType} from '../Domain/Common.js';
import {Evidence} from '../Domain/Evidence.js';
import {ToolExecution} from '../Domain/ToolExecution.js';
import {Checksum} from '../Serialization/Checksum.js';

/**
 * Static builder of provenance-tagged evidence.
 */
export class EvidenceFactory {

    /**
     * Build evidence for an actually executed tool run.
     * @param {ToolExecution} execution - The execution record.
     * @param {string} id - Evidence id.
     * @param {string} createdAt - Creation timestamp (ISO).
     * @returns {Evidence} Evidence with source tool_execution, hashed over the execution.
     */
    public static fromToolExecution(execution: ToolExecution, id: string, createdAt: string): Evidence {
        return {
            id: id,
            type: EvidenceType.Log,
            source: EvidenceSource.ToolExecution,
            inline: `exit=${execution.exitCode ?? 'none'} status=${execution.status} command=${execution.command}`,
            sha256: Checksum.sha256OfValue(execution),
            producedBy: execution.checkId ?? execution.command,
            createdAt: createdAt
        };
    }

    /**
     * Build evidence for an LLM assertion. Never a verified result.
     * @param {string} statement - The LLM's statement.
     * @param {string} producedBy - Who/what produced it.
     * @param {string} id - Evidence id.
     * @param {string} createdAt - Creation timestamp (ISO).
     * @returns {Evidence} Evidence with source llm_assertion.
     */
    public static llmAssertion(statement: string, producedBy: string, id: string, createdAt: string): Evidence {
        return {
            id: id,
            type: EvidenceType.Log,
            source: EvidenceSource.LlmAssertion,
            inline: statement,
            sha256: Checksum.sha256Hex(statement),
            producedBy: producedBy,
            createdAt: createdAt
        };
    }

    /**
     * Build evidence recording that a check was not executable.
     * @param {string} reason - Why it could not run, with a concrete alternative.
     * @param {string} producedBy - Who/what produced it.
     * @param {string} id - Evidence id.
     * @param {string} createdAt - Creation timestamp (ISO).
     * @returns {Evidence} Evidence with source not_executable.
     */
    public static notExecutable(reason: string, producedBy: string, id: string, createdAt: string): Evidence {
        return {
            id: id,
            type: EvidenceType.Log,
            source: EvidenceSource.NotExecutable,
            inline: reason,
            sha256: Checksum.sha256Hex(reason),
            producedBy: producedBy,
            createdAt: createdAt
        };
    }

}