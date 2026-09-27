import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "./api";
import { orderedLessons, type Course, type Enrollment, type Lesson, type Module, type Progress } from "./lms";

/** A course with its outline and the caller's enrollment/progress. */
export function useCourse(courseId: string | undefined) {
  const { accessToken } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [overdue, setOverdue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadProgress = useCallback(async () => {
    if (!courseId) return;
    try {
      const r = await apiFetch<{ enrollment: Enrollment; progress: Progress[] }>(`/api/v1/courses/${courseId}/progress`, { accessToken });
      setEnrollment(r.enrollment);
      setProgress(r.progress);
      setOverdue(false);
    } catch (err) {
      // 404 = not enrolled yet, which is fine.
      if (err instanceof ApiError && err.code === "PAYMENT_OVERDUE") setOverdue(true);
    }
  }, [courseId, accessToken]);

  const loadCourse = useCallback(async () => {
    if (!courseId) return;
    try {
      const r = await apiFetch<{ course: Course; modules: Module[]; lessons: Lesson[] }>(`/api/v1/courses/${courseId}`, { accessToken });
      setCourse(r.course);
      setModules([...r.modules].sort((a, b) => a.orderIndex - b.orderIndex));
      setLessons(orderedLessons(r.modules, r.lessons));
    } catch {
      setError("Couldn't load this course.");
    }
  }, [courseId, accessToken]);

  const reload = useCallback(async () => {
    await Promise.all([loadCourse(), loadProgress()]);
    setLoaded(true);
  }, [loadCourse, loadProgress]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { course, modules, lessons, enrollment, progress, overdue, error, loaded, reload, loadProgress, setProgress };
}
