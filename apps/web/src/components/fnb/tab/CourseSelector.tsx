'use client';

interface CourseSelectorProps {
  activeCourse: number;
  onSelectCourse: (courseNumber: number) => void;
  courseNames?: string[];
}

const DEFAULT_COURSES = ['Apps', 'Entrees', 'Desserts'];

export function CourseSelector({ activeCourse, onSelectCourse, courseNames }: CourseSelectorProps) {
  const courses = courseNames ?? DEFAULT_COURSES;

  return (
    <div
      className="flex gap-1 px-2 py-1.5 shrink-0"
      style={{ backgroundColor: 'var(--fnb-bg-surface)', borderBottom: 'var(--fnb-border-subtle)' }}
    >
      {courses.map((name, i) => {
        const courseNum = i + 1;
        const isActive = activeCourse === courseNum;
        return (
          <button
            key={courseNum}
            type="button"
            onClick={() => onSelectCourse(courseNum)}
            className="rounded-lg px-4 py-2 text-xs font-semibold transition-opacity"
            style={{
              backgroundColor: isActive ? 'var(--fnb-warning)' : 'var(--fnb-bg-elevated)',
              color: isActive ? '#fff' : 'var(--fnb-text-secondary)',
            }}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}
