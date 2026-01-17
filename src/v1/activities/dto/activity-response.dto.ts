export type ParticipationState = 'not_joined' | 'pending' | 'confirmed' | 'waitlisted';

export interface ViewerParticipationMeta {
  participantId: string;
  status: ParticipationState;
  waitlistPosition: number | null;
  joinedAt: Date | null;
  approvedAt: Date | null;
}

export interface ActivityResponseDto {
  id: string;
  hostId: string;
  title: string;
  description: string | null;
  category: string | null;
  interests: string[];
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  activityDate: string;
  startTime: string;
  endTime: string | null;
  maxParticipants: number;
  currentParticipants: number;
  waitlistCount: number;
  status: 'draft' | 'published' | 'completed' | 'cancelled';
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  meetingPointHidden: boolean;
  viewerParticipation?: ViewerParticipationMeta;
}

