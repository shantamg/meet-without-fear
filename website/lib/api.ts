const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export interface InvitationDetails {
  id: string;
  invitedBy: {
    id: string;
    name: string;
  };
  name: string | null;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
  session: {
    id: string;
    status: string;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Fetch invitation details from the backend
 */
export async function getInvitation(invitationId: string): Promise<InvitationDetails | null> {
  try {
    const response = await fetch(`${API_URL}/api/invitations/${invitationId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error("Failed to fetch invitation");
    }

    const data: ApiResponse<{ invitation: InvitationDetails }> = await response.json();
    return data.data?.invitation || null;
  } catch (error) {
    console.error("Error fetching invitation:", error);
    return null;
  }
}

/**
 * Accept an invitation (requires authentication)
 */
export async function acceptInvitation(
  invitationId: string,
  token: string
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/api/invitations/${invitationId}/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || "Failed to accept invitation" };
    }

    return { success: true, sessionId: data.data?.session?.id };
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return { success: false, error: "Network error. Please try again." };
  }
}
