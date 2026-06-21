/**
 * ClassroomEye — Frontend Component Tests
 * Run: cd frontend && npm test
 */

import { render, screen } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import StudentTile from "../components/StudentTile";

const mockStudent = { name: "Aruka" };

describe("StudentTile", () => {
  test("renders student name", () => {
    render(<StudentTile student={mockStudent} score={null} isPresent={false} />);
    expect(screen.getByText("Aruka")).toBeInTheDocument();
  });

  test("shows 'waiting' label when score is null", () => {
    render(<StudentTile student={mockStudent} score={null} isPresent={false} />);
    expect(screen.getByText("waiting")).toBeInTheDocument();
  });

  test("shows 'focused' label when score >= 70", () => {
    render(<StudentTile student={mockStudent} score={75} isPresent={true} />);
    expect(screen.getByText("focused")).toBeInTheDocument();
  });

  test("shows 'looking away' label when score 40-69", () => {
    render(<StudentTile student={mockStudent} score={55} isPresent={true} />);
    expect(screen.getByText("looking away")).toBeInTheDocument();
  });

  test("shows 'distracted' label when score < 40", () => {
    render(<StudentTile student={mockStudent} score={25} isPresent={true} />);
    expect(screen.getByText("distracted")).toBeInTheDocument();
  });

  test("shows score number when score provided", () => {
    render(<StudentTile student={mockStudent} score={72} isPresent={true} />);
    expect(screen.getByText("72")).toBeInTheDocument();
  });

  test("shows — when score is null", () => {
    render(<StudentTile student={mockStudent} score={null} isPresent={false} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  test("shows 'No feed' when no video sources", () => {
    render(
      <StudentTile
        student={mockStudent}
        score={null}
        isPresent={false}
        snapshotSrc={null}
        remoteStream={null}
        videoRef={null}
      />
    );
    expect(screen.getByText("No feed")).toBeInTheDocument();
  });

  test("shows snapshot image when snapshotSrc provided", () => {
    const fakeSrc = "data:image/jpeg;base64,abc123";
    render(
      <StudentTile
        student={mockStudent}
        score={60}
        isPresent={true}
        snapshotSrc={fakeSrc}
      />
    );
    const img = screen.getByAltText("Aruka");
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("base64");
  });

  test("shows snapshot badge when snapshotSrc present", () => {
    const fakeSrc = "data:image/jpeg;base64,abc123";
    render(
      <StudentTile
        student={mockStudent}
        score={60}
        isPresent={true}
        snapshotSrc={fakeSrc}
      />
    );
    expect(screen.getByText(/snapshot/i)).toBeInTheDocument();
  });
});

describe("StudentTile — score colors", () => {
  test("green ring for focused score", () => {
    const { container } = render(
      <StudentTile student={mockStudent} score={80} isPresent={true} />
    );
    const circle = container.querySelector("circle:last-child");
    expect(circle?.getAttribute("stroke")).toBe("#00FF87");
  });

  test("yellow ring for looking-away score", () => {
    const { container } = render(
      <StudentTile student={mockStudent} score={50} isPresent={true} />
    );
    const circle = container.querySelector("circle:last-child");
    expect(circle?.getAttribute("stroke")).toBe("#FFB800");
  });

  test("red ring for distracted score", () => {
    const { container } = render(
      <StudentTile student={mockStudent} score={20} isPresent={true} />
    );
    const circle = container.querySelector("circle:last-child");
    expect(circle?.getAttribute("stroke")).toBe("#FF4545");
  });
});