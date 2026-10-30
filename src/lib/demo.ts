export const DEMO_EMAIL = "demo@qametrics.local";
export const DEMO_PASSWORD = "Demo@12345";
export function demoEnabled() { return process.env.DEMO_MODE === "true"; }
