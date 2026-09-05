import { useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Helmet } from 'react-helmet-async';
import { getCurrentCandidate, updateCandidateProfile, isProfileComplete } from '@/lib/candidateAuth';
import { getRoleById, type RoleId } from '@/data/careerRoles';

export default function ApplyRole() {
  const [, params] = useRoute('/careers/apply/:roleId');
  const [, setLocation] = useLocation();
  const roleId = params?.roleId as RoleId | undefined;
  const role = roleId ? getRoleById(roleId) : undefined;

  useEffect(() => {
    if (!role) {
      setLocation('/careers');
      return;
    }

    const candidate = getCurrentCandidate();
    if (!candidate) {
      setLocation(`/careers/login?redirect=/careers/apply/${roleId}`);
      return;
    }

    updateCandidateProfile({ appliedRole: roleId });

    if (!isProfileComplete(candidate)) {
      setLocation('/careers/profile');
      return;
    }

    setLocation(`/careers/test/${roleId}`);
  }, [role, roleId, setLocation]);

  return (
    <>
      <Helmet>
        <title>Applying for {role?.title ?? 'Role'} - Inveon Technologies</title>
      </Helmet>
      <div className="section-padding flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Preparing your application...</p>
      </div>
    </>
  );
}
