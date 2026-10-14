/** Owner-approved Simplified MVP. Change this single flag to restore Culture UI;
 * API/model/data and RAG knowledge remain independent of this presentation flag.
 */
export const mvpFeatures: Readonly<{ culture: boolean; ticketPrice: boolean }> =
  {
    culture: false,
    ticketPrice: false,
  };
