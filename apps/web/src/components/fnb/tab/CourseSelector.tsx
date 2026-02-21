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
      className="flex gap-1 px-2 py-1.5 border-b shrink-0"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        borderColor: 'rgba(148, 163, 184, 0.15)',
      }}
    >
      {courses.map((name, i) => {
        const courseNum = i + 1;
        const isActive = activeCourse === courseNum;
        return (
          <button
            key={courseNum}
            type="button"
            onClick={() => onSelectCourse(courseNum)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
              isActive ? 'text-white' : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: isActive ? 'var(--fnb-status-ordered)' : 'var(--fnb-bg-elevated)',
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
