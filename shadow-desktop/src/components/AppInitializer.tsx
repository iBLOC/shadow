import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface AppInitializerProps {
  children: React.ReactNode;
}

export function AppInitializer({ children }: AppInitializerProps) {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkSetup = () => {
      const setupComplete = localStorage.getItem('shadow_setup_complete');
      if (!setupComplete) {
        navigate('/setup');
      }
      setIsChecking(false);
    };

    checkSetup();
  }, [navigate]);

  if (isChecking) {
    return null;
  }

  return <>{children}</>;
}
