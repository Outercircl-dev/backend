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
  status: 'draft' | 'published' | 'completed' | 'cancelled';
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

