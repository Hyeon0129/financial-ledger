import React from 'react';

type LiquidPanelProps = React.HTMLAttributes<HTMLDivElement> & {
  className?: string;
  contentClassName?: string;
};

const cx = (...parts: Array<string | undefined | null | false>) =>
  parts.filter(Boolean).join(' ').trim();

export const LiquidPanel: React.FC<LiquidPanelProps> = ({
  className,
  contentClassName,
  children,
  ...rest
}) => {
  return (
    <div className={cx('glass', className)} {...rest}>
      <div className="glass-filter" />
      <div className="glass-overlay" />
      <div className="glass-specular" />
      <div className={cx('glass-content', contentClassName)}>{children}</div>
    </div>
  );
};

export default LiquidPanel;
