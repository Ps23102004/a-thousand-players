import type { Metadata } from 'next';
import stored from '../../../data/tutor/results.json';
import type { TutorResults } from '../../../ai/tutor';
import { TutorContent } from './results';
export const metadata: Metadata = {title:'Onboarding · A Thousand Players'};
// The committed JSON is written by ai/cli/tutor.ts (validated there); TypeScript infers a union of the aids' differing override keys, so cast through unknown.
export default function OnboardingPage() { return <TutorContent data={stored as unknown as TutorResults} />; }
