import { createContext } from "react";

export type Origin = "collector" | "demo";
export const DataOrigin = createContext<Origin>("collector");
