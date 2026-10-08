import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../App";

describe("App", () => {
  it("renders the project dashboard", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /Maintenance Request Reporting System/i })).toBeInTheDocument();
    expect(screen.getByText(/Role Experiences/i)).toBeInTheDocument();
  });
});
