import { customAlphabet } from "nanoid";

export const generateRoomId = () => {
  const nanoid = customAlphabet(
    "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    6,
  );
  const socketId = nanoid();
  return socketId;
};
