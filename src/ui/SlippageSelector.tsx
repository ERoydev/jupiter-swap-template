import { useEffect, useRef, useState } from "react";

interface SlippageSelectorProps {
    value: number;
    onChange: (newBps: number) => void;
}

interface Preset {
    label: string;
    bps: number;
}

const PRESETS: readonly Preset[] = [
    { label: "0.1%", bps: 10 },
    { label: "0.5%", bps: 50 },
    { label: "1.0%", bps: 100 },
] as const;

const PRESET_BPS_SET = new Set(PRESETS.map((p) => p.bps));

function isValidCustomPercent(percent: number): boolean {
    return (
        Number.isFinite(percent) && percent >= 0.01 && percent <= 50
    );
}

export function SlippageSelector({ value, onChange }: SlippageSelectorProps) {
    const isCustomActive = !PRESET_BPS_SET.has(value);
    const [editingCustom, setEditingCustom] = useState(false);
    const [customDraft, setCustomDraft] = useState<string>(
        isCustomActive ? (value / 100).toString() : "",
    );
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (editingCustom && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingCustom]);

    function selectPreset(bps: number) {
        setEditingCustom(false);
        setError(null);
        if (bps !== value) onChange(bps);
    }

    function startCustomEdit() {
        setCustomDraft(isCustomActive ? (value / 100).toString() : "");
        setError(null);
        setEditingCustom(true);
    }

    function commitCustom() {
        const parsed = parseFloat(customDraft);
        if (!isValidCustomPercent(parsed)) {
            setError("Enter 0.01–50");
            // Blur without commit: revert UI to previous value, hide error.
            setEditingCustom(false);
            setError(null);
            return;
        }
        const bps = Math.round(parsed * 100);
        setEditingCustom(false);
        setError(null);
        if (bps !== value) onChange(bps);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            e.preventDefault();
            commitCustom();
        } else if (e.key === "Escape") {
            e.preventDefault();
            setEditingCustom(false);
            setError(null);
        }
    }

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const v = e.target.value;
        setCustomDraft(v);
        const parsed = parseFloat(v);
        if (v === "" || isValidCustomPercent(parsed)) {
            setError(null);
        } else {
            setError("Enter 0.01–50");
        }
    }

    const customLabel = isCustomActive ? `${(value / 100).toString()}%` : "Custom";
    const errorId = "slippage-custom-error";

    return (
        <div
            role="radiogroup"
            aria-label="Slippage tolerance"
            className="flex gap-2"
        >
            {PRESETS.map((p) => {
                const active = value === p.bps && !editingCustom;
                return (
                    <button
                        key={p.bps}
                        type="button"
                        aria-pressed={active}
                        aria-label={`${p.label} slippage tolerance`}
                        onClick={() => selectPreset(p.bps)}
                        className={
                            "flex-1 rounded-md border px-2 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                            (active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-transparent text-foreground border-border hover:bg-accent")
                        }
                    >
                        {p.label}
                    </button>
                );
            })}

            {editingCustom ? (
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    value={customDraft}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onBlur={commitCustom}
                    aria-label="Custom slippage tolerance (percent)"
                    aria-invalid={error !== null}
                    aria-describedby={error ? errorId : undefined}
                    className={
                        "flex-1 rounded-md border bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                        (error
                            ? "border-destructive text-destructive"
                            : "border-border text-foreground")
                    }
                />
            ) : (
                <button
                    type="button"
                    aria-pressed={isCustomActive}
                    aria-label="Custom slippage tolerance"
                    onClick={startCustomEdit}
                    className={
                        "flex-1 rounded-md border px-2 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                        (isCustomActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-transparent text-foreground border-border hover:bg-accent")
                    }
                >
                    {customLabel}
                </button>
            )}

            {error && (
                <span id={errorId} className="sr-only" role="alert">
                    {error}
                </span>
            )}
        </div>
    );
}
