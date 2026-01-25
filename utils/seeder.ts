import { ref, update, get } from "firebase/database";
import { database } from "../firebase";

export const seedAccessCodes = async () => {
  console.log("Seeder: Initializing...");
  
  // Check if already seeded to avoid spamming or accidental runs
  const codesRef = ref(database, 'accessCodes');
  try {
      const snapshot = await get(codesRef);
      if (snapshot.exists()) {
          const count = Object.keys(snapshot.val()).length;
          if (count >= 30) {
              console.log(`Seeder: Skipped. ${count} codes already exist in database.`);
              return;
          }
      }
  } catch (e) {
      console.warn("Seeder: Could not check existing codes, proceeding anyway.", e);
  }

  const updates: Record<string, any> = {};
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  const generateCode = () => {
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Generate 30 codes
  for (let i = 0; i < 30; i++) {
    const code = generateCode();
    // Use code as key for easy lookup
    updates[`accessCodes/${code}`] = { 
        used: false,
        createdAt: Date.now()
    };
  }

  try {
    await update(ref(database), updates);
    console.log("Seeder: SUCCESS. 30 new access codes have been written to Firebase.");
  } catch (err) {
    console.error("Seeder: FAILED to write to database.", err);
  }
};