import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "rosellea.robots";

export type Robot = {
  id: string;
  name: string;
  host: string;
  addedAt: number;
};

export async function listRobots(): Promise<Robot[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addRobot(robot: Omit<Robot, "addedAt">): Promise<Robot> {
  const robots = await listRobots();
  const existing = robots.findIndex((r) => r.id === robot.id);
  const entry: Robot = { ...robot, addedAt: Date.now() };
  if (existing >= 0) {
    robots[existing] = entry;
  } else {
    robots.push(entry);
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(robots));
  return entry;
}

export async function removeRobot(id: string): Promise<void> {
  const robots = await listRobots();
  const filtered = robots.filter((r) => r.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(filtered));
}

export async function getRobot(id: string): Promise<Robot | null> {
  const robots = await listRobots();
  return robots.find((r) => r.id === id) ?? null;
}

export async function updateRobotHost(id: string, host: string): Promise<void> {
  const robots = await listRobots();
  const idx = robots.findIndex((r) => r.id === id);
  if (idx < 0) return;
  robots[idx] = { ...robots[idx], host };
  await AsyncStorage.setItem(KEY, JSON.stringify(robots));
}
