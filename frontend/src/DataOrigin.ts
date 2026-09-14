import { createContext } from "react";

export type Origin = "data" | "demo";
export const DataOrigin = createContext<Origin>("demo");
