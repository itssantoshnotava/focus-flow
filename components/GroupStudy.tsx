import React, { useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { ArrowLeft, Users, Plus, LogIn } from "lucide-react";
import { ref, set, push, get, child, update } from "firebase/database";
import { database } from "../firebase";

export const GroupStudy: React.FC = () => {
  const navigate = useNavigate();
  const { roomCode } = useParams(); // 👈 IMPORTANT
  const location = useLocation();

  const mode = (location.state as any)?.mode; // "create" | "join"

  const [userName, setUserName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [isJoinMode, setIsJoinMode] = useState(false);

  /* ---------------- CREATE ROOM ---------------- */
  const handleCreateRoom = async () => {
    if (!userName.trim()) return;

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let newCode = "";
    for (let i = 0; i < 6; i++) {
      newCode += chars[Math.floor(Math.random() * chars.length)];
    }

    const participantsRef = ref(database, `rooms/${newCode}/participants`);
    const newParticipantKey = push(participantsRef).key;
    if (!newParticipantKey) return;

    await set(ref(database, `rooms/${newCode}`), {
      host: userName,
      isRunning: false,
      startTime: null,
      participants: {
        [newParticipantKey]: {
          name: userName,
          joinedAt: Date.now(),
        },
      },
    });

    navigate(`/group/${newCode}`, { state: { mode: "create" } });
  };

  /* ---------------- JOIN ROOM ---------------- */
  const handleJoinRoom = async () => {
    if (!userName.trim() || !roomCodeInput.trim()) return;

    const code = roomCodeInput.trim();
    const snapshot = await get(child(ref(database), `rooms/${code}`));
    if (!snapshot.exists()) return;

    const participantsRef = ref(database, `rooms/${code}/participants`);
    const newParticipantKey = push(participantsRef).key;
    if (!newParticipantKey) return;

    await update(participantsRef, {
      [newParticipantKey]: {
        name: userName,
        joinedAt: Date.now(),
      },
    });

    navigate(`/group/${code}`, { state: { mode: "join" } });
  };

  /* ================= ROOM VIEW ================= */
  if (roomCode) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-200 flex flex-col items-center justify-center gap-4">
        <h1 className="text-3xl font-bold">Room {roomCode}</h1>

        {mode === "create" && (
          <p className="text-neutral-500">Room created successfully.</p>
        )}
        {mode === "join" && (
          <p className="text-neutral-500">You joined the room.</p>
        )}

        <button
          onClick={() => navigate("/group")}
          className="mt-6 px-4 py-2 bg-neutral-800 rounded-lg"
        >
          Leave Room
        </button>
      </div>
    );
  }

  /* ================= LOBBY VIEW ================= */
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-3xl font-bold text-center">Group Study</h1>

        <input
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Enter your name"
          className="w-full bg-neutral-900 border border-neutral-700 px-4 py-3 rounded-lg"
        />

        {isJoinMode && (
          <input
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value)}
            placeholder="Enter room code"
            className="w-full bg-neutral-900 border border-neutral-700 px-4 py-3 rounded-lg"
          />
        )}

        {!isJoinMode ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleCreateRoom}
              className="bg-indigo-600 py-3 rounded-lg"
            >
              Create Room
            </button>
            <button
              onClick={() => setIsJoinMode(true)}
              className="bg-neutral-800 py-3 rounded-lg"
            >
              Join Room
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setIsJoinMode(false)}
              className="bg-neutral-800 py-3 rounded-lg"
            >
              Back
            </button>
            <button
              onClick={handleJoinRoom}
              className="bg-indigo-600 py-3 rounded-lg"
            >
              Enter
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
