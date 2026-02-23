// 0 = Local, 5 = Unplayable Ping
export const pingMatrix = {
  'NA':   { 'NA': 0, 'EU': 1, 'ASIA': 2, 'OCE': 3, 'SA': 1, 'AF': 3 },
  'EU':   { 'NA': 1, 'EU': 0, 'ASIA': 2, 'OCE': 4, 'SA': 3, 'AF': 1 },
  'ASIA': { 'NA': 2, 'EU': 2, 'ASIA': 0, 'OCE': 2, 'SA': 5, 'AF': 4 },
  'OCE':  { 'NA': 3, 'EU': 4, 'ASIA': 2, 'OCE': 0, 'SA': 4, 'AF': 5 },
  'SA':   { 'NA': 1, 'EU': 3, 'ASIA': 5, 'OCE': 4, 'SA': 0, 'AF': 4 },
  'AF':   { 'NA': 3, 'EU': 1, 'ASIA': 4, 'OCE': 5, 'SA': 4, 'AF': 0 }
};

// Prevent unplayable connections
export function simulateSquad(simulatedSquad) {
  if (!simulatedSquad || simulatedSquad.length === 0) return false;
  
  return simulatedSquad.some(potentialHost => 
    simulatedSquad.every(member => pingMatrix[potentialHost.region][member.region] < 5)
  );
}

// Simulate squads to identify best possible host
export function getBestHost(fullSquad) {
  if (!fullSquad || fullSquad.length === 0) return null;

  let bestHost = fullSquad[0];
  let minPenalty = Infinity;

  for (const potentialHost of fullSquad) {
    const penalty = fullSquad.reduce((sum, member) => 
      sum + pingMatrix[potentialHost.region][member.region], 0
    );
    // Resolve tie-breaks on first come, first served
    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestHost = potentialHost;
    }
  }
  
  return bestHost;
}
