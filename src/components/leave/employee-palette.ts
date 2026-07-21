export type EmployeePalette = { bg: string; border: string; text: string };

// Stable per-employee colour: hash uuid → hue, fixed saturation/lightness so
// every chip on the grid stays visually balanced. Pure + deterministic, safe
// for both Server and Client Components.
export function employeePalette(employeeId: string): EmployeePalette {
  let hash = 0;
  for (let i = 0; i < employeeId.length; i++) {
    hash = (hash * 31 + employeeId.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return {
    bg: `hsl(${hue} 70% 92%)`,
    border: `hsl(${hue} 55% 70%)`,
    text: `hsl(${hue} 55% 28%)`,
  };
}
