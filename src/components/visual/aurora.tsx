/**
 * The aurora backdrop. Three pre-blurred, slowly drifting colour orbs plus a
 * film-grain overlay. This is what the glass surfaces refract — without it,
 * dark glass is invisible on flat black. Pure CSS (no JS), so it costs nothing
 * on the main thread and honours prefers-reduced-motion / -transparency.
 */
export function Aurora() {
  return (
    <>
      <div className="aurora" aria-hidden="true">
        <span
          className="aurora__orb aurora__orb--a"
          style={{
            width: "48vw",
            height: "48vw",
            left: "-10vw",
            top: "-12vh",
            background: "var(--neon-violet)",
          }}
        />
        <span
          className="aurora__orb aurora__orb--b"
          style={{
            width: "42vw",
            height: "42vw",
            right: "-8vw",
            top: "-4vh",
            background: "var(--neon-cyan)",
          }}
        />
        <span
          className="aurora__orb aurora__orb--c"
          style={{
            width: "38vw",
            height: "38vw",
            left: "28vw",
            bottom: "-18vh",
            background: "var(--neon-magenta)",
          }}
        />
      </div>
      <div className="grain" aria-hidden="true" />
    </>
  );
}
