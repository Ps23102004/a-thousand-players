import type { Metadata } from 'next';
import stored from '../../../data/tutor/results.json';
import type { TutorResults } from '../../../ai/tutor';
import { TutorContent } from './results';
export const metadata: Metadata = {title:'Onboarding · A Thousand Players'};
export default function OnboardingPage() { return <TutorContent data={stored as TutorResults} />; }
