import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface DetailViewLayoutProps {
  header: React.ReactNode;
  sidebarCards?: React.ReactNode;
  mainContent: React.ReactNode;
  className?: string;
}

export const DetailViewLayout: React.FC<DetailViewLayoutProps> = ({
  header,
  sidebarCards,
  mainContent,
  className,
}) => {
  return (
    <div className={cn("flex flex-col gap-6 w-full", className)}>
      {/* Header Area */}
      <div className="w-full shrink-0">
        {header}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Content Area - spans 8 columns if sidebar exists, otherwise 12 */}
        <div 
          className={cn(
            "order-2 lg:order-1 flex flex-col gap-6", 
            sidebarCards ? "lg:col-span-8 xl:col-span-9" : "lg:col-span-12"
          )}
        >
          {mainContent}
        </div>

        {/* Sidebar Cards Area - Quick Stats, Actions */}
        {sidebarCards && (
          <div className="order-1 lg:order-2 lg:col-span-4 xl:col-span-3 flex flex-col gap-6 lg:sticky lg:top-6">
            {sidebarCards}
          </div>
        )}
      </div>
    </div>
  );
};

export default DetailViewLayout;
