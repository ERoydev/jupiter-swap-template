/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SlippageSelector } from "./SlippageSelector";

afterEach(() => {
    cleanup();
});

describe("SlippageSelector", () => {
    it("renders three presets + Custom with 0.5% active by default (AC-4-3-1)", () => {
        render(<SlippageSelector value={50} onChange={vi.fn()} />);
        const p01 = screen.getByRole("button", {
            name: /0\.1% slippage tolerance/i,
        });
        const p05 = screen.getByRole("button", {
            name: /0\.5% slippage tolerance/i,
        });
        const p10 = screen.getByRole("button", {
            name: /1\.0% slippage tolerance/i,
        });
        const custom = screen.getByRole("button", {
            name: /^custom slippage tolerance$/i,
        });

        expect(p01.getAttribute("aria-pressed")).toBe("false");
        expect(p05.getAttribute("aria-pressed")).toBe("true");
        expect(p10.getAttribute("aria-pressed")).toBe("false");
        expect(custom.getAttribute("aria-pressed")).toBe("false");
    });

    it("calls onChange with 10/50/100 when the matching preset is clicked (AC-4-3-2)", () => {
        const onChange = vi.fn();
        const { rerender } = render(
            <SlippageSelector value={50} onChange={onChange} />,
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: /0\.1% slippage tolerance/i,
            }),
        );
        expect(onChange).toHaveBeenLastCalledWith(10);

        rerender(<SlippageSelector value={10} onChange={onChange} />);
        fireEvent.click(
            screen.getByRole("button", {
                name: /1\.0% slippage tolerance/i,
            }),
        );
        expect(onChange).toHaveBeenLastCalledWith(100);
    });

    it("does not re-call onChange when clicking the already-active preset", () => {
        const onChange = vi.fn();
        render(<SlippageSelector value={50} onChange={onChange} />);
        fireEvent.click(
            screen.getByRole("button", {
                name: /0\.5% slippage tolerance/i,
            }),
        );
        expect(onChange).not.toHaveBeenCalled();
    });

    it("switches to an input on Custom click and auto-focuses (AC-4-3-4)", () => {
        render(<SlippageSelector value={50} onChange={vi.fn()} />);
        fireEvent.click(
            screen.getByRole("button", {
                name: /^custom slippage tolerance$/i,
            }),
        );
        const input = screen.getByLabelText(/custom slippage tolerance \(percent\)/i);
        expect(input).toBe(document.activeElement);
    });

    it("commits valid custom value on Enter and calls onChange with bps (AC-4-3-5)", () => {
        const onChange = vi.fn();
        render(<SlippageSelector value={50} onChange={onChange} />);
        fireEvent.click(
            screen.getByRole("button", {
                name: /^custom slippage tolerance$/i,
            }),
        );
        const input = screen.getByLabelText(
            /custom slippage tolerance \(percent\)/i,
        ) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "2.5" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onChange).toHaveBeenCalledWith(250);
    });

    it("commits valid custom value on blur", () => {
        const onChange = vi.fn();
        render(<SlippageSelector value={50} onChange={onChange} />);
        fireEvent.click(
            screen.getByRole("button", {
                name: /^custom slippage tolerance$/i,
            }),
        );
        const input = screen.getByLabelText(
            /custom slippage tolerance \(percent\)/i,
        ) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "0.3" } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith(30);
    });

    it("shows inline error on invalid typing and does not call onChange (AC-4-3-6)", () => {
        const onChange = vi.fn();
        render(<SlippageSelector value={50} onChange={onChange} />);
        fireEvent.click(
            screen.getByRole("button", {
                name: /^custom slippage tolerance$/i,
            }),
        );
        const input = screen.getByLabelText(
            /custom slippage tolerance \(percent\)/i,
        ) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "99" } });
        expect(input.getAttribute("aria-invalid")).toBe("true");
        // No onChange during error-typed state
        expect(onChange).not.toHaveBeenCalled();
    });

    it("reverts to previous value on blur with invalid input (no onChange)", () => {
        const onChange = vi.fn();
        render(<SlippageSelector value={50} onChange={onChange} />);
        fireEvent.click(
            screen.getByRole("button", {
                name: /^custom slippage tolerance$/i,
            }),
        );
        const input = screen.getByLabelText(
            /custom slippage tolerance \(percent\)/i,
        ) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "abc" } });
        fireEvent.blur(input);
        expect(onChange).not.toHaveBeenCalled();
        // Custom button should be back
        expect(
            screen.getByRole("button", {
                name: /^custom slippage tolerance$/i,
            }),
        ).toBeTruthy();
    });

    it("collapses without applying on Escape", () => {
        const onChange = vi.fn();
        render(<SlippageSelector value={50} onChange={onChange} />);
        fireEvent.click(
            screen.getByRole("button", {
                name: /^custom slippage tolerance$/i,
            }),
        );
        const input = screen.getByLabelText(
            /custom slippage tolerance \(percent\)/i,
        ) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "0.3" } });
        fireEvent.keyDown(input, { key: "Escape" });
        expect(onChange).not.toHaveBeenCalled();
        expect(
            screen.getByRole("button", {
                name: /^custom slippage tolerance$/i,
            }),
        ).toBeTruthy();
    });

    it("marks Custom as active when value is not a preset", () => {
        render(<SlippageSelector value={250} onChange={vi.fn()} />);
        const custom = screen.getByRole("button", {
            name: /custom slippage tolerance/i,
        });
        expect(custom.getAttribute("aria-pressed")).toBe("true");
        expect(custom.textContent).toContain("2.5%");
    });

    it("is keyboard-reachable — each preset button is a focusable button", () => {
        render(<SlippageSelector value={50} onChange={vi.fn()} />);
        const buttons = screen.getAllByRole("button");
        expect(buttons.length).toBe(4);
        for (const b of buttons) {
            expect(b.tagName).toBe("BUTTON");
            expect((b as HTMLButtonElement).disabled).toBe(false);
        }
    });

    it("exposes role=radiogroup with the slippage label", () => {
        render(<SlippageSelector value={50} onChange={vi.fn()} />);
        const group = screen.getByRole("radiogroup");
        expect(group.getAttribute("aria-label")).toBe("Slippage tolerance");
    });
});
